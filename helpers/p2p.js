const mongoose = require('mongoose');
const validator = require('node-validator');
const async = require('async');
const cron = require('node-cron');
const https = require('https');

const common = require('./common');
const endecrypt = require('./newendecryption');

const pairsDb = require('../model/p2pPairs');
const orderDb = require('../model/p2pCoinOrder');
const mapDb = require('../model/p2pOrdertemp');
const escrowDb = require('../model/p2pEscrow');
const userDb = require('../model/users');
const currDb = require('../model/currency');
const wallet = require('../model/userWallet');
const users = require('../model/users');
const notify = require('../model/notify');
const mail = require('../helpers/mail');

var mapP2p = function() {};
let p2pMap = new mapP2p();
var socket = 0; var usrListArr = [];

mapP2p.prototype._unsetUsrId = (usrTkn) => {
  var index = usrListArr.indexOf(usrTkn);
  if(index > -1) {
    usrListArr.splice(index, 1);
  }
}

exports.SocketInit = function(socketIO) {
  socket = socketIO;
}

mapP2p.prototype._createResponse = function(response, pair='', liq='') {
  if (response['success'] == 1) {
    var pairs = pair.split('_');
    if (response['ordertype'] == 'stop') {
      response['msg'] = "Stop order created successfully";
      p2pMap._sendResponse(pairs[0], pairs[1], response.order.user_id, 'userEmit');
    } else {
      p2pMap.mapOrder(response.order, pairs[0], pairs[1], liq, function(res) {});
    }
  } else {
    socket.sockets.emit('createResponse', response);
  }
};

mapP2p.prototype._sendResponse = function(from, to, userId, type) {
  if (type == 'pairEmit') {
    getP2pInfo({from:from, to:to}, (pairData) => {
      socket.sockets.emit('p2pPairResponse', pairData);
    });
  }
  p2pMap._p2pUserEmit(userId.toString(), from, to);
};

exports.p2pUserEmit = function(values) {
  var userId = endecrypt.decryptNew(values.token)
  from = values.from,
  to = values.to;
  if(userId) {
    p2pMap._p2pUserEmit(userId, from, to);
  }
}

exports.p2pPairEmit = function(values) {
  var userId = values.userId,
  from = values.from,
  to = values.to;
  if(userId) {
    p2pMap._sendResponse(from, to, userId, "pairEmit");
  }
}

exports.p2pOrderUpdate = function(ordId) {
  p2pMap._sendOrderUpdate(ordId);
}

mapP2p.prototype._sendOrderUpdate = function(ordId) {
  socket.sockets.emit('p2pOrderUpdates', {order_id:ordId});
};

mapP2p.prototype._p2pUserEmit = (userId, from, to) => {
  var userRes = {};
  common.multiBalance(userId, from, to, function(multiBal) {
    if(multiBal) {
      async.parallel({
        openOrder: function(cb) {
          orderDb.find({ user_id: mongoose.mongo.ObjectId(userId), status: { $in:['active', 'partially']} }, {_id:0, Price:1, Amount:1, pair:1, Type:1, order_id:1}).sort({_id: -1}).exec(cb)
        },
        myHistory: function(cb) {
          mapDb.find({ $or: [{buyerUserId: mongoose.mongo.ObjectId(userId)}, {sellerUserId: mongoose.mongo.ObjectId(userId)}] }, {pair:1, buyerUserId:1, askPrice:1, filledAmount:1, cancel_id:1, created_at:1, buy_order:1, sell_order:1}).sort({created_at: -1}).limit(20).exec(cb)
        }
      }, function(err, results) {
        userRes.token = endecrypt.encryptNew(userId);
        userRes.fromBal = multiBal[from];
        userRes.toBal = multiBal[to];
        userRes.pair = from+'_'+to;
        if(results) {
          formatOpen(userId, results.openOrder, function(openRes) {
            formatMyTrade(userId, results.myHistory, function(myRes) {
              userRes.open = openRes;
              userRes.hist = myRes;
              socket.sockets.emit('p2pUserResponse', userRes);
            })
          })
        } else {
          userRes.open = [];
          userRes.hist = [];
          socket.sockets.emit('p2pUserResponse', userRes);
        }
      })
    }
  })
}

let formatOpen = exports.formatOpen = (userId, open, callback) => {
  if(open.length > 0) {
    var opens = []; var openArr; var i = 1; let len = open.length;
    open.forEach((val) => {
      let cls = (val.Type == "buy") ? "text-success":"text-danger";
      openArr = {'pair':val.pair.replace('_', '/'), 'amount':val.Amount, 'price':val.Price, 'cls':cls, 'token':val.order_id, created_at:val.created_at};
      opens.push(openArr);
      if(i == len) { callback(opens); }
      i = i + 1;
    });
  } else {
    callback([]);
  }
}

let formatMyTrade = exports.formatMyTrade = (userId, trade, callback) => {
  if(trade.length > 0) {
    var hists = [];
    var histArr; var i = 1; let len = trade.length;
    trade.forEach((val) => {
      let orderId = endecrypt.encryptNew(val._id.toString());
      let buyUser = val.buyerUserId.toString();
      let status = (val.cancel_id != null) ? "Cancelled" : "Completed";
      let scls = (status == "Completed") ? "text-success" : "text-danger";
      let tcls = (buyUser == userId) ? "text-success":"text-danger";
      let ordId = (buyUser == userId) ? val.buy_order:val.sell_order;
      histArr = {'token':orderId,  'pair':val.pair.replace('_', '/'), 'amount':val.filledAmount, 'price':val.askPrice, 'status':status, 'scls':scls, 'cls':tcls, order_id:ordId, created_at:val.created_at};
      hists.push(histArr);
      if(i == len) { callback(hists); }
      i = i + 1;
    })
  } else {
    callback([]);
  }
}

let getP2pInfo = exports.getP2pInfo = function (pair, callback) {
  let selPair = pair.from+'_'+pair.to;
  let buyWhere = { firstCurrency:pair.from, secondCurrency:pair.to, match_status:0, Type:'buy', status: { $in:['active', 'partially']} };
  let sellWhere = { firstCurrency:pair.from, secondCurrency:pair.to, match_status:0, Type:'sell', status: { $in:['active', 'partially']} };
  async.parallel({
    BuyOrder : function(cb) {
      orderDb.aggregate([
        { $match : buyWhere },
        { $project : { oid:'$_id', Price:'$Price', status:'$status', Amount:{$sum:'$Amount'} } },
        { $group : { '_id':'$Price', 'Amount':{$sum:'$Amount'}, 'Price':{ $first:'$Price' }, 'status':{ $first:'$status' }, 'oid':{ $first:'$_id' } } },
        { $sort : { Price:-1, _id:1 } },
        { $limit : 50 }
        ]).exec(cb)
    },
    SellOrder : function (cb) {
      orderDb.aggregate([
        { $match : sellWhere },
        { $project : { oid:'$_id', Price:'$Price', status:'$status', Amount:{$sum:'$Amount'} } },
        { $group : { '_id':'$Price', 'Amount':{$sum:'$Amount'}, 'Price':{ $first:'$Price' }, 'status':{ $first:'$status' }, 'oid':{ $first:'$_id' } } },
        { $sort : { Price:1, _id:1 } },
        { $limit : 50 }
        ]).exec(cb)
    },
    BuyXid : function(cb) {
      orderDb.find(buyWhere, {Amount:1, Price:1, status:1, xid:1}).sort({Price:-1, _id:1}).limit(10).exec(cb)
    },
    SellXid : function(cb) {
      orderDb.find(sellWhere, {Amount:1, Price:1, status:1, xid:1}).sort({Price:1, _id:1}).limit(10).exec(cb)
    },
    TradeHistory : function(cb) {
      mapDb.find({firstCurrency:pair.from, secondCurrency:pair.to, cancel_id:null}, {filledAmount:1, _id:0, askPrice:1, created_at:1, sellorderId:1, buyorderId:1}).sort({created_at:-1}).limit(20).exec(cb)
    }
  },function(err, results) {
    if(results) {
      formatBuy(results.BuyOrder, function(buyRes) {
        formatSell(results.SellOrder, function(sellRes) {
          formatXbuy(results.BuyXid, function(xbuyRes) {
            formatXsell(results.SellXid, function(xsellRes) {
              formatTrade(results.TradeHistory, function(tradeRes) {
                callback({pair:selPair, buys:buyRes, sells:sellRes, xbuys:xbuyRes, xsells:xsellRes, tradeHists:tradeRes});
              })
            })
          })
        })
      })
    } else {
      callback({pair:selPair, buys:[], sells:[], tradeHists:[]});
    }
  })
}

formatXbuy = exports.formatXbuy = function(buy, callback) {
  if(buy.length > 0) {
    var buys = []; var buyArr; var i = 1; var len = buy.length;
    buy.forEach((val) => {
      var amount = val.Amount;
      checkOrderTemp(val.status, "Buy", val._id, function(fillAmt) {
        var filled = parseFloat(amount) - parseFloat(fillAmt);
        buyArr = { 'amount':filled, 'price':val.Price, 'xid':val.xid };
        buys.push(buyArr);
        if(i == len) { callback(buys); }
        i = i + 1;
      })
    });
  } else {
    callback([]);
  }
}

formatXsell = exports.formatXsell = function(sell, callback) {
  if(sell.length > 0) {
    var sells = []; var sellArr; var i = 1; var len = sell.length;
    sell.forEach((sval) => {
      var amount = sval.Amount;
      checkOrderTemp(sval.status, "Sell", sval._id, function(fillAmt) {
        var filled = parseFloat(amount) - parseFloat(fillAmt);
        sellArr = { 'amount':filled, 'price':sval.Price, 'xid':sval.xid };
        sells.push(sellArr);
        if(i == len) { callback(sells); }
        i = i + 1;
      })
    });
  } else {
    callback([]);
  }
}

formatBuy = exports.formatBuy = function(buy, callback) {
  if(buy.length > 0) {
    var buys = []; var buyArr; var bSum = 0; var i = 1; var len = buy.length;
    buy.forEach((val) => {
      var amount = val.Amount;
      checkOrderTemp(val.status, "Buy", mongoose.mongo.ObjectId(val.oid), function(fillAmt) {
        var filled = parseFloat(amount) - parseFloat(fillAmt);
        bSum = bSum + filled;
        buyArr = { 'amount':parseFloat(filled).toFixed(8), 'price':val.Price, 'sum':parseFloat(bSum).toFixed(8) };
        buys.push(buyArr);
        if(i == len) { callback(buys); }
        i = i + 1;
      })
    });
  } else {
    callback([]);
  }
}

formatSell = exports.formatSell = function(sell, callback) {
  if(sell.length > 0) {
    var sells = []; var sellArr; var sSum = 0; var i = 1; var len = sell.length;
    sell.forEach((sval) => {
      var amount = sval.Amount;
      checkOrderTemp(sval.status, "Sell", mongoose.mongo.ObjectId(sval.oid), function(fillAmt) {
        var filled = parseFloat(amount) - parseFloat(fillAmt);
        sSum = sSum + filled;
        sellArr = { 'amount':parseFloat(filled).toFixed(8), 'price':sval.Price, 'sum':parseFloat(sSum).toFixed(8) };
        sells.push(sellArr);
        if(i == len) { callback(sells); }
        i = i + 1;
      })
    });
  } else {
    callback([]);
  }
}

formatTrade = exports.formatTrade = function(trade, callback) {
  if(trade.length > 0) {
    var histArr; var tradeHists = []; var i = 1; var len = trade.length;
    trade.forEach((tval) => {
      var cls = (tval.buyorderId > tval.sellorderId) ? "text-success" : "text-danger";
      histArr = {'ctime':tval.created_at, 'amount':tval.filledAmount.toFixed(8), 'price':tval.askPrice.toFixed(8), 'cls':cls};
      tradeHists.push(histArr);
      if(i == len) { callback(tradeHists); }
      i = i + 1;
    });
  } else {
    callback([]);
  }
}

let checkOrderTemp = exports.checkOrderTemp = function (status, type, orderId, callback) {
  if(status == "partially") {
    let matchCase = (type == 'Buy') ? { buyorderId: orderId } : { sellorderId: orderId };
    mapDb.aggregate([
      { $match: matchCase }, { $group: { _id: null, sum: { $sum: "$filledAmount" } } }, { $project: { _id: 0, sum: 1 } }
      ]).exec((err, results) => {
        if (results.length > 0) {
          if (results[0].sum) {
            callback(results[0].sum)
          } else {
            callback(0)
          }
        } else {
          callback(0)
        }
      })
    } else {
      callback(0);
    }
  }

  let checkCancelOrdertemp = exports.checkCancelOrdertemp = function (type, orderId, callback) {
    let matchCase = (type == 'buy') ? { buyorderId: orderId } : { sellorderId: orderId };
    mapDb.aggregate([
      { $match: matchCase }, { $group: { _id: null, sum: { $sum: "$filledAmount" } } }, { $project: { _id: 0, sum: 1 } }
      ]).exec((err, results) => {
        if (results.length > 0) {
          if (results[0].sum) {
            callback(results[0].sum)
          } else {
            callback(0)
          }
        } else {
          callback(0)
        }
      })
    }

    let cancelIOrder = exports.cancelOrder = (ordVal, userId, callback) => {
      orderDb.findOne({user_id:mongoose.mongo.ObjectId(userId), order_id:ordVal, cancel_status:0}, {_id:1, Amount:1, Type:1, status:1, matchid:1, pay_status:1, pagestatus:1, match_status:1, firstCurrency:1, secondCurrency:1, order_id:1, Price:1}).exec(function(ordErr, ordRes) {
        if (ordRes) {
          let orderId = ordRes._id;
          let first = ordRes.firstCurrency;
          let second = ordRes.secondCurrency;
          let ordId = ordRes.order_id;
          let matchId = ordRes.matchid;
          let amount = ordRes.Amount;
          let type = ordRes.Type;
          let price = ordRes.Price;
          let status = ordRes.status;
          let paySts = ordRes.pay_status;
          let pageSts = ordRes.pagestatus;
          let matSts = ordRes.match_status;
      // if(status == "active") { status = "partially"; }
      getTempAmount(status, type, orderId, amount, matchId, paySts, function(fillAmt) {
        let filled = fillAmt.filled;
        let subtotal = fillAmt.sum * price;
        let orderJson = {
          askAmount: parseFloat(amount).toFixed(8), askPrice: parseFloat(price).toFixed(8), firstCurrency: first, secondCurrency: second, filledAmount: parseFloat(filled).toFixed(8), total: 0, buy_fee: 0, sell_fee: 0, cancel_id: userId, pair: first+'_'+second
        };
        if(type == "buy") {
          var balCur = second;
          var upTotal = subtotal;
          orderJson.sellorderId = mongoose.mongo.ObjectId(0);
          orderJson.sellerUserId = mongoose.mongo.ObjectId(0);
          orderJson.buyorderId = orderId;
          orderJson.buyerUserId = mongoose.mongo.ObjectId(userId);
          orderJson.cancel_order = "buy";
          orderJson.buy_order = ordVal;
        } else {
          var balCur = first;
          var upTotal = filled;
          orderJson.sellorderId = orderId;
          orderJson.sellerUserId = mongoose.mongo.ObjectId(userId);
          orderJson.buyorderId = mongoose.mongo.ObjectId(0);
          orderJson.buyerUserId = mongoose.mongo.ObjectId(0);
          orderJson.cancel_order = "sell";
          orderJson.sell_order = ordVal;
        }
        getP2pBalance(userId, balCur, ordRes.Type, function(balRes) {
          var balance = parseFloat(balRes);
          var upBal = parseFloat(upTotal) + balance;
          upBal = parseFloat(upBal).toFixed(8);
          mapDb.create(orderJson, function(insErr, insRes) {
            if(insRes) {
              orderDb.updateOne({_id:orderId}, {"$set":{status:'cancelled', pagestatus:'cancel', cancel_status:1, updated_at:new Date()}}).exec(function(upErr,upRes) {
                if(upRes) {
                  upP2pBalance(userId, balCur, upBal, ordRes.Type, function(callRes) {
                    if(callRes) {

                      let notObj = {user_id:userId, category:"P2P Order Cancellation", message:"Your P2P "+type+" order has been cancelled for "+amount.toFixed(8)+" "+first+" with payment of "+upTotal.toFixed(2)+" "+second, page:"p2p"};
                      notify.create(notObj, function(notErr, notRes) {});

                      if(ordRes.Type == "sell") {
                        console.log({"userid":userId, "currency":balCur, "exist":balance, "new":upBal, "id":orderId.toString(), "type":"P2P Order Cancel", "time":new Date()});
                      }
                      callback({success:1});
                      p2pMap._sendResponse(first, second, mongoose.mongo.ObjectId(userId), 'pairEmit');
                    } else {
                      callback({success:0, msg:"Failed to update balance"});
                    }
                  })
                } else {
                  callback({success:0, msg:"Failed to update order"});
                }
              })
            } else {
              callback({success:0, msg:"Failed to cancel order"});
            }
          })
        })
      })
    } else {
      callback({success:0, msg:"Invalid request"});
    }
  })
    }

    let getTempAmount = exports.getTempAmount = function (status, type, orderId, amt, matchId, paySts, cb) {
      let amount = parseFloat(amt);
      if(matchId != undefined) {
        orderDb.findOne({_id:mongoose.mongo.ObjectId(matchId)}, {Amount:1, Type:1}).exec(function(ordErr, ordRes) {
          let mamount = parseFloat(ordRes.Amount);
          let mtype = ordRes.Type;
          checkCancelOrdertemp(type, orderId, function(fillAmt) {
            checkCancelOrdertemp(mtype, matchId, function(fillAmt1) {
              let sumAmt = parseFloat(fillAmt);
              let msumAmt = parseFloat(fillAmt1);
              let actAmt = ((amount - sumAmt) > (mamount - msumAmt)) ? mamount - msumAmt : amount - sumAmt;
              let completeAmt = sumAmt + actAmt;
              let filled = (completeAmt == amount) ? amount : amount - completeAmt;
              let sum = (paySts == 0) ? actAmt : amount - completeAmt;
              cb({filled:filled, sum:sum});
            });
          });
        });
      } else {
        checkCancelOrdertemp(type, orderId, function(fillAmt) {
          let filled = amount - parseFloat(fillAmt);
          cb({filled:filled, sum:filled});
        });
      }
    }

    let getP2pBalance = exports.getP2pBalance = function (userId, currency, type, cb) {
      if(type == "buy") {
        cb(0);
      } else {
        common.findUserBalance(userId, currency, function(balRes) {
          cb(balRes);
        });
      }
    }

    let upP2pBalance = exports.upP2pBalance = function (userId, currency, upBal, type, cb) {
      if(type == "buy") {
        cb(true);
      } else {
        common.updateUserBalance(userId, currency, upBal, function(callRes) {
          if(callRes) { cb(true); } else { cb(false); }
        });
      }
    }

    exports.matching = function(userId, order) {
      p2pMap.getOrders(order, userId, function(res) {});
    }

    mapP2p.prototype.getOrders = function(order, userId, type) {
      userId = mongoose.mongo.ObjectId(userId);
      let from = order.firstCurrency;
      let to = order.secondCurrency;
      if (order.Type == 'buy') {
        var getWhere = { firstCurrency:from, secondCurrency:to, Type:'sell', user_id: { $ne:userId }, status: { $in:['active', 'partially'] }, Price: { $lte:order.Price }, match_status:0 };
        var sortArr = { Price:1, _id:1 };
        var lookCon = { from:'p2p_ordertemp', localField:'_id', foreignField:'sellorderId', as:'OT' };
      } else {
        var getWhere = { firstCurrency:from, secondCurrency:to, Type:'buy', user_id: { $ne:userId }, status: { $in:['active', 'partially'] }, Price: { $gte:order.Price }, match_status:0 };
        var sortArr = { Price:-1, _id:1 };
        var lookCon = { from:'p2p_ordertemp', localField:'_id', foreignField:'buyorderId', as:'OT' };
      }
      if(order.prefer_xid != "") { getWhere['xid'] = order.prefer_xid; }
      orderDb.aggregate([
        { $lookup : lookCon },
        { $match : getWhere },
        { $project : { _id:'$_id', user_id:'$user_id', Price:'$Price', Amount:'$Amount', Total:'$Total', order_id:'$order_id', filledAmount:{ $sum:'$OT.filledAmount' } } },
    // { $group : { _id:'$_id', user_id:{ $first:'$user_id' }, Price:{ $first:'$Price' }, Amount:{ $first:'$Amount' }, Total:{ $first:'$Total' }, filledAmount:{ $sum:'$filledAmount' } } },
    { $sort:sortArr }
    ]).exec(function(activeErr, activeRes) {
      if (activeRes.length > 0) {
        p2pMap.matchOrder(from, to, order, activeRes, 0, (mapRes) => {})
      }
    });
  };

  mapP2p.prototype.matchOrder = (from, to, order, matchOrders, ind, callback) => {
    if(order.status == "active" || order.status == "partially") {
      let orderId = order._id;
      let userId = order.user_id.toString();
      let Price = parseFloat(order.Price);
      let Amount = parseFloat(order.Amount);
      let Type = order.Type;

      let matched = matchOrders[ind];
      let matchorderId = matched._id;
      let matchuserId = matched.user_id.toString();
      let matchPrice = matched.Price;
      let matchAmount = matched.Amount;
      let matchTotal = matched.Total;
      var approxiAmount = matchAmount - matched.filledAmount;
      approxiAmount = parseFloat(approxiAmount).toFixed(8);
      if(Type == "buy") {
        var sellorderId = matchorderId;
        var selluserId = matched.user_id;
        var buyorderId = orderId;
        var buyuserId = order.user_id;
        var buyPrice = Price;
      } else {
        var sellorderId = orderId;
        var selluserId = order.user_id;
        var buyorderId = matchorderId;
        var buyuserId = matched.user_id;
        var buyPrice = matchPrice;
      }
      escrowDb.findOne({sellorderId:sellorderId, buyorderId:buyorderId}, {_id:1}).exec(function(escErr, escRes) {
        if(!escErr && !escRes) {
          let pt = new Date(); pt.setHours( pt.getHours() + 1 );
          orderDb.updateOne({_id:orderId}, {"$set":{ matchid:matchorderId, match_status:1, paytime:pt, matchtime:new Date(),  pagestatus:"pay", updated_at:new Date()}}).exec(function(upErr, upRes) {});
          orderDb.updateOne({_id:matchorderId}, {"$set":{ matchid:orderId, match_status:1, paytime:pt, matchtime:new Date(),  pagestatus:"pay", updated_at:new Date()}}).exec(function(upErr1, upRes1) {});

          checkCancelOrdertemp(Type, orderId, function(fillAmt) {
            fillAmt = parseFloat(fillAmt);
            var sumamount = Amount - fillAmt;
            if(order.status == "active" || order.status == "partially") {
              var actAmt = (parseFloat(sumamount) >= parseFloat(approxiAmount)) ? parseFloat(approxiAmount) : sumamount;
              var buyTotal = actAmt * buyPrice;
              buyTotal = parseFloat(buyTotal).toFixed(2);
              let remarks = common.getRemarks();
              let pair = from+'_'+to;
              let ordJson = { sellorderId:sellorderId, sellerUserId:selluserId, amount:actAmt, currency:from, pair:from+'_'+to, buy_status:"inactive", sell_status:"inactive", buyorderId:buyorderId, buyerUserId:buyuserId, remarks:remarks };
              escrowDb.create(ordJson, function(creErr, creRes) {
                p2pMap._sendOrderUpdate(order.order_id);
                p2pMap._sendOrderUpdate(matched.order_id);
              });

              orderDb.updateOne({_id:orderId}, {"$set":{ filledAmount:actAmt}}).exec(function(upErr2, upRes2) {});
              orderDb.updateOne({_id:matchorderId}, {"$set":{ filledAmount:actAmt}}).exec(function(upErr3, upRes3) {});

              var msg = "Your P2P "+Type+" order has been matched for "+actAmt.toFixed(8)+" "+from+" with payment of "+parseFloat(buyTotal).toFixed(2)+" "+to;
              let notObj = {user_id:buyuserId, category:"P2P Order Matched", message:msg, page:"p2p"};
              let notObj1 = {user_id:selluserId, category:"P2P Order Matched", message:msg, page:"p2p"};
              notify.create(notObj, function(notErr, notRes) {});
              notify.create(notObj1, function(notErr, notRes) {});

              matchingEmail(buyuserId, selluserId, actAmt, buyTotal, from, to, function(match) {});
            }
          });
        }
      })
    }
  }

  let matchingEmail = exports.matchingEmail = function (buyuserId, selluserId, amount, price, from, to, callback) {
    users.find({ _id:{$in:[mongoose.mongo.ObjectId(buyuserId),mongoose.mongo.ObjectId(selluserId)]}}, {_id: 1, primary_value:1, added_val:1, username:1}).exec(function(userErr, userRes) {
      if (userErr) { return res.json({success:0, msg:"Please try again later"}); }
      if(userRes) {

        let buyUser = userRes.filter(item => item._id.toString() == buyuserId.toString());
        let sellUser = userRes.filter(item => item._id.toString() == selluserId.toString());

        let buySpecialVars = { '###USER###': buyUser[0].username, '###AMT###': amount+' '+from, '###PRICE###': price+' '+to, '###PAIR###': from+'_'+to, '###TYPE###': 'Buying', '###TYPE1###': 'Buying', '###MATCHUSER###': sellUser[0].username};
        let buyUsermail = endecrypt.decryptNew(buyUser[0].primary_value) + endecrypt.decryptNew(buyUser[0].added_val);

        let sellSpecialVars = { '###USER###': sellUser[0].username, '###AMT###': amount+' '+from, '###PRICE###': price+' '+to, '###PAIR###': from+'_'+to, '###TYPE###': 'Selling', '###TYPE1###': 'Selling', '###MATCHUSER###': buyUser[0].username};
        let sellUsermail = endecrypt.decryptNew(sellUser[0].primary_value) + endecrypt.decryptNew(sellUser[0].added_val);

        mail.sendMail(buyUsermail, 'order_matching', buySpecialVars, function(mailRes) { });
        mail.sendMail(sellUsermail, 'order_matching', sellSpecialVars, function(mailRes) { });
        callback(1);
      } else {
        callback(0);
      }
    })
  }

  // cron.schedule('*/10 * * * * *', () => {
  //   convertPrice();
  // });

  const cryptoSymbols = 'BTC,ETH,XRP';
  const currencies = 'EUR,GBP';
  var toSym = ['EUR', 'GBP'];

  const options = {
    hostname: 'min-api.cryptocompare.com',
    path: `/data/pricemulti?fsyms=${ cryptoSymbols }&tsyms=${ currencies }`
  };

  function convertPrice() {
    var result = {};
    https.get(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (data) => {
        body += data;
      });
      res.on('end', () => {
        try {
          const output = JSON.parse(body);
          var btc = output.BTC;
          var eth = output.ETH;
          var xrp = output.XRP;
          toSym.forEach(element => {
            if(btc[element] != undefined && btc[element] != '') {
              result['BTC_'+element] = btc[element];
              pairsDb.updateOne({from_symbol:'BTC', to_symbol:element}, {$set:{last_price:btc[element], updated_at:new Date()}}).exec(function(upErr1, upRes1) { });
            } 
            if(eth[element] != undefined && eth[element] != '') {
              result['ETH_'+element] = eth[element];
              pairsDb.updateOne({from_symbol:'ETH', to_symbol:element}, {$set:{last_price:eth[element], updated_at:new Date()}}).exec(function(upErr2, upRes2) { });
            }
            if(xrp[element] != undefined && xrp[element] != '') {
              result['XRP_'+element] = xrp[element];
              pairsDb.updateOne({from_symbol:'XRP', to_symbol:element}, {$set:{last_price:xrp[element], updated_at:new Date()}}).exec(function(upErr3, upRes3) { });
            }
          });
          socket.sockets.emit('p2pPrice', {result:result});
        }
        catch(err) {
          // console.log(`Error parsing JSON from server:${err.message}`);
        }
      });
    }).on('error', (err) => {
      console.log(`Request failed, ${err.message}`);
    });
  }