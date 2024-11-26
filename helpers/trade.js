const mongoose = require('mongoose');
const validator = require('node-validator');
const async = require('async');
const crypto = require("crypto");

const common = require('./common');
const endecrypt = require('./newendecryption');

const kuws = require('kucoin-node-api')
const config = {
  apiKey: '66a20169c6688800013cda74',
  secretKey: '1175e15d-f912-40ce-9456-75ca99508924',
  passphrase: 'Hive@1234!',
  environment: 'live'
}
kuws.init(config);
const ordUrl = 'https://api.kucoin.com/api/v1/orders';

const pairsDB = require('../model/pairs');
const orderDB = require('../model/CoinOrder');
const mapDb = require('../model/mapping');
const profitDb = require('../model/profit');
const userDB = require('../model/users');
const referralDB = require('../model/referral');
const siteSettings = require('../model/siteSettings');
const notify = require('../model/notify');

const Client = require('node-rest-client').Client;
const restCli = new Client();

const fs = require('fs');
var mapTrade = function() {};
let _tradeMap = new mapTrade();
var socket = 0; let crnt_order; var usrListArr = [];
const nonLiqs = ['COALUSDT', 'COALGBP', 'COALEUR'];

mapTrade.prototype._unsetUsrId = (usrTkn) => {
  var index = usrListArr.indexOf(usrTkn);
  if(index > -1) {
    usrListArr.splice(index, 1);
  }
}

exports.SocketInit = function(socketIO) {
  common.SocketInit(socketIO);
  socket = socketIO;
}

function signRequest(params, cb) {
  const partner = "GSFintechUAB";
  const partKey = "f7c3592d-49bf-4a0f-8cf4-3595336cd598";

  let nonce = Date.now() + '';
  let strSign = nonce + 'POST/api/v1/orders' + JSON.stringify(params);
  let strBrok = nonce + partner + config.apiKey;

  let signRes = crypto.createHmac('sha256', config.secretKey).update(strSign).digest('base64');
  let passRes = crypto.createHmac('sha256', config.secretKey).update(config.passphrase).digest('base64');
  let partRes = crypto.createHmac('sha256', partKey).update(strBrok).digest('base64');
  
  let header = {'KC-API-TIMESTAMP':nonce, 'KC-API-KEY':config.apiKey, 'KC-API-PARTNER':partner, 'KC-API-SIGN':signRes, 'KC-PARTNER-SIGN':partRes, 'KC-API-PASSPHRASE':passRes, 'KC-API-KEY-VERSION':2, 'Content-Type':'application/json'};
  cb(header);
}

exports.createOrder = function(data) {
  var resp = {};
  resp['success'] = 0,
  resp['msg'] = '',
  resp['type'] = data['type'],
  resp['ordertype'] = data['order'],
  resp['pair'] = data['pair'],
  resp['liquidity'] = data['liquidity'],
  resp['token'] = data['token'];
  var usrTkn = usrListArr.indexOf(data['token']);
  if(usrTkn == -1) {
    usrListArr.push(data['token']);
    setTimeout(_tradeMap._unsetUsrId, 20000, data['token']);
    var validate = validator.isObject()
    .withRequired('token', validator.isString())
    .withRequired('amount', validator.isString())
    .withRequired('price')
    .withRequired('stop_price')
    .withRequired('total')
    .withRequired('pair', validator.isString())
    .withRequired('order', validator.isString())
    .withRequired('type', validator.isString())
    .withRequired('market_type', validator.isString())
    .withRequired('liquidity', validator.isString());
    validator.run(validate, data, function(errCnt, errMsg) {
      if(errCnt == 0) {
        var pair = data['pair'],
        token = data['token'],
        amount = parseFloat(data['amount']),
        price = parseFloat(data['price']),
        stopPrc = parseFloat(data['stop_price']),
        order = data['order'],
        liquidity = data['liquidity'],
        marType = data['market_type'],
        type = data['type'];
        if (parseFloat(amount) <= 0 || parseFloat(price) <= 0 || amount == "" || price == "") {
          resp['msg'] = "Enter valid amount & price"; return _tradeMap._createResponse(resp);
        }
        var pairs = pair.split('_');
        if(pairs.length != 2) {
          resp['msg'] = "Invalid pair"; return _tradeMap._createResponse(resp);
        }
        var first = pairs[0];
        var second = pairs[1];
        var token = data['token'];
        var userId = common.getUserId(token);
        if(!userId) {
          resp['msg'] = "Invalid user"; return _tradeMap._createResponse(resp);
        }
        userDB.findOne({_id:mongoose.mongo.ObjectId(userId), status:1}, {_id:1}).exec(function (usrErr, usrData) {
          if(usrData) {
            pairsDB.findOne({ "from_symbol":first, "to_symbol":second, "status":1 }, {_id:0, trade_fee:1, last_price:1, min_amt:1, decimal:1, amt_decimal:1, liquidity:1}).exec(function (err, getPair) {
              if(getPair) {
                let lastPrice = parseFloat(getPair.last_price);
                let feePer = parseFloat(getPair.trade_fee);
                let minAmt = parseFloat(getPair.min_amt);
                let deci = parseInt(getPair.decimal);
                let amtdec = parseInt(getPair.amt_decimal);
                let oppType = (type == "buy") ? "sell" : "buy";
                resp['min_amt'] = minAmt;
                price = (order == "market") ? lastPrice : price;
                if(amount < minAmt && marType == "amount") {
                  resp['msg'] = "Enter amount more than "+minAmt;
                  return _tradeMap._createResponse(resp);
                }
                common.checkExistOrder(first, second, oppType, userId, order, price, function(prcRes) {
                  if(prcRes.status == 0) {
                    resp['msg'] = prcRes.msge; return _tradeMap._createResponse(resp);
                  }
                  // if(order == "stoplimit") {
                  //   if(type == "buy" && stopPrc <= lastPrice) {
                  //     resp['msg'] = "Enter price above "+lastPrice; return _tradeMap._createResponse(resp);
                  //   } else if(type == "sell" && stopPrc >= lastPrice) {
                  //     resp['msg'] = "Enter price below "+lastPrice; return _tradeMap._createResponse(resp);
                  //   }
                  // }
                  var subtotal = (marType == "amount") ? amount * price : amount;
                  var feeAmt = (subtotal * feePer) / 100;
                  var total = (type == "buy") ? subtotal + feeAmt : subtotal - feeAmt;
                  var balCurr = (type == "buy") ? second : first;
                  common.findUserBalance(userId, balCurr, function(balRes) {
                    var balance = parseFloat(balRes);
                    if ((total > balance && type == "buy") || (amount > balance && type == "sell")) {
                      resp['msg'] = "Insufficient Balance";
                      return _tradeMap._createResponse(resp);
                    }
                    let selPair = first + second;
                    let binIndex = nonLiqs.indexOf(selPair);
                    if(order == "market" && binIndex == -1) {
                      let trdPair = first + '-' +second;
                      kuws.getTicker(trdPair).then(ticker=> {
                        if(ticker.code == '200000') {
                          let selPrc = parseFloat(ticker.data.price);
                          if(order == "market") {
                            if(marType == "total") {
                              amount = amount / selPrc;
                              amount = amount.toFixed(amtdec);
                              amount = parseFloat(amount);
                            }
                            if (amount > balance && type == "sell") {
                              resp['msg'] = "Insufficient Balance";
                              return _tradeMap._createResponse(resp);
                            }
                          }
                          let selMul = amount * selPrc;
                          let selFee = (selMul * feePer) / 100;
                          let selTot = (type == "buy") ? selMul + selFee : selMul - selFee;
                          if(type == "buy") {
                            if(selTot > balance) {
                              resp['msg'] = "Insufficient Balance";
                              return _tradeMap._createResponse(resp);
                            }
                          }
                          var cliId = common.randomString(9) + new Date().getTime() + common.randomString(7);
                          let orderJson = {
                            user_id: mongoose.mongo.ObjectId(userId), Amount: amount.toFixed(8), Price: selPrc.toFixed(8), stop_price: selPrc.toFixed(8), Type: type, ordertype: order, Fee: selFee.toFixed(8), fee_per: feePer, Total: selTot.toFixed(8), status: "market", firstCurrency: first, secondCurrency: second, clientOrder: cliId,site:liquidity
                          };
                          orderDB.create(orderJson, function(insErr, insRes) {
                            let notObj = {user_id:userId, category:"Exchange Order Creation", message:"Your exchange "+type+" order has been created for "+amount+" "+first+" with price of "+selPrc+" "+second, page:"trade"};
                            notify.create(notObj, function(notErr, notRes) {});
                            if(insRes) {
                              let trdId = insRes._id;
                              let usrId = mongoose.mongo.ObjectId(userId);
                              resp['success'] = 1;
                              resp['lastId'] = trdId;
                              resp['order'] = insRes;

                              if(getPair.liquidity) {
                                var params = {clientOid:cliId, side:type, symbol:trdPair, type:'market', price:selPrc, size:amount, "tradeType":"TRADE"};
                                signRequest(params, function(reqHead) {
                                  var args = { data: params, headers: reqHead };
                                  restCli.post(ordUrl, args, function (resp1, res3) {
                                    let conType = 'market '+type+' ==> ';
                                    console.log(conType, resp1);
                                  });
                                })
                                // if(type == "buy") {
                                //   kuws.placeOrder(params).then(ordRes=> { console.log('market buy ==>', ordRes); });
                                // } else {
                                //   kuws.placeOrder(params).then(ordRes=> { console.log('market sell ==>', ordRes); });
                                // }
                              } else {
                                return _tradeMap._createResponse(resp, pair, liquidity);
                              }
                              var upBal = (type == "buy") ? balance - parseFloat(selTot) : balance - parseFloat(amount);
                              upBal = parseFloat(upBal).toFixed(8);
                              common.updateUserBalance(userId, balCurr, upBal, function(upRes) {
                                if(upRes) {
                                  console.log({"userid":userId, "currency":balCurr, "exist":balance, "new":upBal, "id":trdId, "type":"Order Place", "time":new Date()});
                                  let tempJson = {};
                                  if(type == "buy") {
                                    tempJson = { sellorderId: mongoose.mongo.ObjectId(0), sellerUserId: mongoose.mongo.ObjectId(0), askAmount: parseFloat(amount), askPrice: selPrc, firstCurrency: first, secondCurrency: second, filledAmount: parseFloat(amount), buyorderId: trdId, buyerUserId: usrId, buy_fee: parseFloat(selFee).toFixed(8), sell_fee: 0, total: parseFloat(selMul), pair: first+'_'+second, datetime: new Date() };
                                  } else if(type == "sell") {
                                    tempJson = { sellorderId: trdId, sellerUserId: usrId, askAmount: parseFloat(amount), askPrice: selPrc, firstCurrency: first, secondCurrency: second, filledAmount: parseFloat(amount), buyorderId: mongoose.mongo.ObjectId(0), buyerUserId: mongoose.mongo.ObjectId(0), buy_fee: 0, sell_fee: parseFloat(selFee).toFixed(8), total: parseFloat(selMul), pair: first+'_'+second, datetime: new Date() };
                                  }
                                  mapDb.create(tempJson, function(tempErr, tempRes)  {
                                    let notObj = {user_id:userId, category:"Exchange Order Completed", message:"Your exchange "+type+" order has been completed for "+amount+" "+first+" with price of "+selPrc+" "+second, page:"trade"};
                                    notify.create(notObj, function(notErr, notRes) {});

                                    _tradeMap._completeOrder(trdId, type, first, second, userId, amount, selPrc, feePer, "filled", (resOrder) => {
                                      if(resOrder) {
                                        _tradeMap._sendResponse(first, second, userId, 'userEmit');
                                      }
                                    })
                                  });
                                } else {
                                  resp['msg'] = "Failed to update balance";
                                  return _tradeMap._createResponse(resp);
                                }
                              });
                            } else {
                              resp['msg'] = "Failed to create an order";
                              return _tradeMap._createResponse(resp);
                            }
                          });
                        } else {
                          common.checkActiveOrder(first, second, oppType, userId, order, function(res) {
                            if(res) {
                              var status = (order == "stoplimit") ? "stoplimit" : ((order == "market") ? "market" : "active");
                              var cliId = common.randomString(9) + new Date().getTime() + common.randomString(7);
                              let orderJson = {
                                user_id: mongoose.mongo.ObjectId(userId), Amount: amount.toFixed(8), Price: price.toFixed(deci), Type: type, ordertype: order, Fee:feeAmt, fee_per:feePer, Total:total, status:status, firstCurrency:first, secondCurrency:second, clientOrder:cliId, site:liquidity
                              };
                              orderDB.create(orderJson, function(insErr, insRes) {
                                if(insRes) {
                                  resp['success'] = 1;
                                  resp['lastId'] = insRes._id;
                                  resp['order'] = insRes;
                                  if(order == "market") {
                                    _tradeMap._createResponse(resp, pair, liquidity);
                                  } else {
                                    var upBal = (type == "buy") ? balance - parseFloat(total) : balance - parseFloat(amount);
                                    upBal = parseFloat(upBal).toFixed(8);
                                    common.updateUserBalance(userId, balCurr, upBal, function(upRes) {
                                      if(upRes) {
                                        console.log({"userid":userId, "currency":balCurr, "exist":balance, "new":upBal, "id":insRes._id.toString(), "type":"Order Place", "time":new Date()});
                                        return _tradeMap._createResponse(resp, pair, liquidity);
                                      } else {
                                        resp['msg'] = "Failed to update balance";
                                        return _tradeMap._createResponse(resp);
                                      }
                                    });
                                  }
                                } else {
                                  resp['msg'] = "Failed to create an order";
                                  return _tradeMap._createResponse(resp);
                                }
                              });
                            } else {
                              resp['msg'] = "No "+oppType+" orders available";
                              return _tradeMap._createResponse(resp);
                            }
                          })
                        }
                      });
                    } else {
                      common.checkActiveOrder(first, second, oppType, userId, order, function(res) {
                        if(res) {
                          var status = (order == "stoplimit") ? "stoplimit" : ((order == "market") ? "market" : "active");
                          var cliId = common.randomString(9) + new Date().getTime() + common.randomString(7);
                          let orderJson = {
                            user_id: mongoose.mongo.ObjectId(userId), Amount: amount.toFixed(8), Price: price.toFixed(8), stop_price: stopPrc.toFixed(8), Type: type, ordertype: order, Fee: feeAmt.toFixed(8), fee_per: feePer, Total: total.toFixed(8), status: status, firstCurrency: first, secondCurrency: second, clientOrder: cliId,site:liquidity
                          };
                          orderDB.create(orderJson, function(insErr, insRes) {
                            if(insRes) {
                              resp['success'] = 1;
                              resp['lastId'] = insRes._id;
                              resp['order'] = insRes;
                              var upBal = (type == "buy") ? balance - parseFloat(total) : balance - parseFloat(amount);
                              upBal = parseFloat(upBal).toFixed(8);
                              common.updateUserBalance(userId, balCurr, upBal, function(upRes) {
                                if(upRes) {
                                  console.log({"userid":userId, "currency":balCurr, "exist":balance, "new":upBal, "id":insRes._id, "type":"Order Place", "time":new Date()});
                                  return _tradeMap._createResponse(resp, pair, liquidity);
                                } else {
                                  resp['msg'] = "Failed to update balance";
                                  return _tradeMap._createResponse(resp);
                                }
                              });
                            } else {
                              resp['msg'] = "Failed to create an order";
                              return _tradeMap._createResponse(resp);
                            }
                          });
                        } else {
                          resp['msg'] = "No "+oppType+" orders available";
                          return _tradeMap._createResponse(resp);
                        }
                      })
                    }
                  })
                })
              } else {
                resp['msg'] = "Invalid pair"; return _tradeMap._createResponse(resp);
              }
            });
          } else {
            resp['msg'] = "Invalid request!"; return _tradeMap._createResponse(resp);
          }
        });
      } else {
        resp['msg'] = "Invalid request"; return _tradeMap._createResponse(resp);
      }
    })
  } else {
    resp['msg'] = 'Place order after 5 seconds';
    return _tradeMap._createResponse(resp);
  }
}

exports.createResponse = function(response, pair='', liq='') {
  return _tradeMap._createResponse(response, pair, liq, function(res) {});
};

mapTrade.prototype._createResponse = function(response, pair='', liq='') {
  if (response['success'] == 1) {
    var pairs = pair.split('_');
    if (response['ordertype'] == 'stoplimit') {
      response['msg'] = "Stop order created successfully";
      if(liq  == 'binance') {
        _tradeMap.mapOrder(response.order, pairs[0], pairs[1], liq, function(res) {});
      } else {
        _tradeMap._sendResponse(pairs[0], pairs[1], response.order.user_id, 'userEmit');
      }
    } else {
      if (response['ordertype'] == 'market') {
        _tradeMap.marketMap(response.order, pairs[0], pairs[1], response.min_amt, liq, 0, response, function(res) {});
      } else {
        _tradeMap.mapOrder(response.order, pairs[0], pairs[1], liq, function(res) {});
      }
    }
  } else {
    socket.sockets.emit('createResponse', response);
  }
  if (response['ordertype'] != 'market') {
    socket.sockets.emit('createResponse', response);
  }
};

mapTrade.prototype._marketResponse = function(response, pair='', liq='') {
  socket.sockets.emit('createResponse', response);
};

exports.chkMualTrdeTst = function(response) {
  _tradeMap.mapOrder(response, response.firstCurrency, response.secondCurrency, function(res) {});
};

mapTrade.prototype._sendResponse = function(from, to, userId, type) {
  if (type == 'pairEmit') {
    common.tradePairUnset(from+'_'+to, (unsetData) => {
      common.getPairInfo({from_symbol:from, to_symbol:to}, 0, (pairData) => {
        socket.sockets.emit('pairResponse', pairData);
      });
    });
  }
  _tradeMap._userEmit(userId.toString(), from, to);
};

mapTrade.prototype.updateTradePair = function(from, to, price) {
  common.updatePairInfo(from, to, price, (res) => {
    if(res) {
      socket.sockets.emit('pairDetails', res);
    }
  });
};

function getTypePar(trdPair, ordType, type, stpPrc, cb) {
  if(ordType == "limit") {
    cb({type:'LIMIT'});
  } else {
    kuws.getTicker(trdPair).then(ticker=> {
      if(ticker.code == '200000') {
        let selPrc = parseFloat(ticker.data.price);
        if(type == "buy") {
          var par = (parseFloat(stpPrc) >= selPrc) ? "loss" : "entry";
        } else {
          var par = (parseFloat(stpPrc) <= selPrc) ? "loss" : "entry";
        }
        cb({stopPrice:stpPrc, type:par})
      } else {
        cb(false);
      }
    });
  }
}

mapTrade.prototype.mapOrder = (lastOrder, from, to, liq='', callback) => {
  _tradeMap._sendResponse(from, to, lastOrder.user_id, 'pairEmit');
  var selPair = from + to;
  var usrId = lastOrder.user_id;
  var ordType = lastOrder.Type;
  var ordAmt = lastOrder.Amount.toString();
  var ordPrc = lastOrder.Price.toString();
  var cliId = lastOrder.clientOrder;
  var pair = lastOrder.firstCurrency.toLowerCase()+'_'+lastOrder.secondCurrency.toLowerCase();
  let binIndex = nonLiqs.indexOf(selPair);
  if(lastOrder.ordertype != 'market' && liq != "") {
    if(liq == 'binance' && binIndex == -1) {
      var ordAmt = lastOrder.Amount;
      var ordPrc = lastOrder.Price;
      let trdPair = from + '-' +to;
      getTypePar(trdPair, lastOrder.ordertype, ordType, lastOrder.stop_price, async function(typePar) {
        if(lastOrder.ordertype == 'limit') {
          var params = { clientOid:cliId, side:ordType, symbol:trdPair, type:'limit', price:ordPrc, size:ordAmt, "tradeType":"TRADE" }
        } else {
          var stp = typePar.type;
          var params = { clientOid:cliId, side:ordType, symbol:trdPair, type:'limit', price:ordPrc, stopPrice:lastOrder.stop_price, stop:stp, size:ordAmt, "tradeType":"TRADE" }
        }
        signRequest(params, function(reqHead) {
          var args = { data: params, headers: reqHead };
          restCli.post(ordUrl, args, function (ordRes, res3) {
            let conType = 'Kucoin '+ordType+' Order ==> ';
            if(ordRes.code == '200000') {
              console.log(conType, ordRes);
              if(ordRes.data.orderId != "" && ordRes.data.orderId != null && ordRes.data.orderId != undefined) {
                orderDB.updateOne({_id:lastOrder._id}, {$set:{orderId:ordRes.data.orderId, site:'binance', clientOrder:ordRes.data.orderId}},function(err, resEr){});
              } else {
                console.log(conType+' error:',ordRes);
              }
            } else {
              console.log(conType+' error:',ordRes);
            }
          });
        })
        // if(ordType == "buy") {
        //   kuws.placeOrder(params).then(ordRes=> {
        //     if(ordRes.code == '200000') {
        //       console.log('Kucoin buy ==>', ordRes);
        //       if(ordRes.data.orderId != "" && ordRes.data.orderId != null && ordRes.data.orderId != undefined) {
        //         orderDB.updateOne({_id:lastOrder._id}, {$set:{orderId:ordRes.data.orderId, site:'binance', clientOrder:ordRes.data.orderId}},function(err, resEr){});
        //       } else {
        //         console.log('Kucoin buy Order error:',ordRes);
        //       }
        //     } else {
        //       console.log('Kucoin buy Order error:',ordRes);
        //     }
        //   });
        // } else {
        //   kuws.placeOrder(params).then(ordRes=> {
        //     if(ordRes.code == '200000') {
        //       console.log('Kucoin sell ==>', ordRes);
        //       if(ordRes.data.orderId != "" && ordRes.data.orderId != null && ordRes.data.orderId != undefined) {
        //         orderDB.updateOne({_id:lastOrder._id}, {$set:{orderId:ordRes.data.orderId, site:'binance', clientOrder:ordRes.data.orderId}},function(err, resEr){});
        //       } else {
        //         console.log('Kucoin sell Order error:',ordRes);
        //       }
        //     } else {
        //       console.log('Kucoin sell Order error:',ordRes);
        //     }
        //   });
        // }
      })
    } else {
      if (lastOrder.Type == 'buy') {
        var getWhere = { firstCurrency:from, secondCurrency:to, Type:'sell', user_id: { $ne:lastOrder.user_id }, status: { $in:['active', 'partially']}, Price: { $lte:lastOrder.Price }, site:'gs20' };
        var sortArr = { Price:1, _id:1 };
        var lookCon = { from:'ordertemp', localField:'_id', foreignField:'sellorderId', as:'OT' };
      } else {
        var getWhere = { firstCurrency:from, secondCurrency:to, Type:'buy', user_id: { $ne:lastOrder.user_id }, status: { $in:['active', 'partially']}, Price: { $gte:lastOrder.Price }, site:'gs20' };
        var sortArr = { Price:-1, _id:1 };
        var lookCon = { from:'ordertemp', localField:'_id', foreignField:'buyorderId', as:'OT' };
      }
      orderDB.aggregate([
        { $lookup : lookCon },
        { $match : getWhere },
        { $project : { _id:'$_id', user_id:'$user_id', Price:'$Price', Amount:'$Amount', Fee:'$Fee', fee_per:'$fee_per', Total:'$Total', filledAmount:{ $sum:'$OT.filledAmount' } } },
        { $group : { _id:'$_id', user_id:{ $first:'$user_id' }, Price:{ $first:'$Price' }, Amount:{ $first:'$Amount' }, Fee:{ $first:'$Fee' }, fee_per:{ $first:'$fee_per' }, Total:{ $first:'$Total' }, filledAmount:{ $sum:'$filledAmount' } } },
        { $sort:sortArr }
      ]).exec(function(activeErr, activeRes) {
        if (activeRes.length > 0) {
          _tradeMap.mappingLoop(from, to, lastOrder, activeRes, 0, (mapRes) => {})
        } else {
          _tradeMap._sendResponse(from, to, lastOrder.user_id, 'pairEmit');
        }
      })
    }
  }
}

mapTrade.prototype._completeOrder = (id, type, first, second, userId, amount, price, feePer, status, callback) => {
  var total = amount * price;
  var tradeFee = (total * feePer) / 100;
  var tradeTotal = total - tradeFee;
  tradeFee = parseFloat(tradeFee).toFixed(8);
  tradeTotal = parseFloat(tradeTotal).toFixed(8);
  orderDB.updateOne({_id:id}, {"$set":{status:status, updated_at:new Date()}}).exec(function(upErr,upRes) {
    if(upRes) {
      _tradeMap.referral(type, tradeFee, second, userId);
      if(type == "buy") {
        common.findUserBalance(userId, first, function(balRes) {
          var balance = parseFloat(balRes);
          var upBal = balance + parseFloat(amount);
          upBal = parseFloat(upBal).toFixed(8);
          common.updateUserBalance(userId, first, upBal, function(callRes) {
            if(callRes) {
              console.log({"userid":userId, "currency":first, "exist":balance, "new":upBal, "id":id, "type":"Buy Order Match", "time":new Date()});
              callback(true);
            } else {
              callback(false);
            }
          });
        })
      } else {
        common.findUserBalance(userId, second, function(balRes) {
          var balance = parseFloat(balRes);
          var upBal = parseFloat(balance) + parseFloat(tradeTotal);
          upBal = parseFloat(upBal).toFixed(8);
          common.updateUserBalance(userId, second, upBal, function(callRes) {
            if(callRes) {
              console.log({"userid":userId, "currency":second, "exist":balance, "new":upBal, "id":id, "type":"Sell Order Match", "time":new Date()});
              callback(true);
            } else {
              callback(false);
            }
          });
        })
      }
    } else {
      callback(false);
    }
  })
}

exports.userEmit = function(values) {
  var userId = endecrypt.decryptNew(values.token)
  from = values.from,
  to = values.to;
  if(userId) {
    _tradeMap._userEmit(userId, from, to);
  }
}

mapTrade.prototype._userEmit = (userId, from, to) => {
  var userRes = {};
  common.multiBalance(userId, from, to, function(multiBal) {
    if(multiBal) {
      async.parallel({
        allOrders: function(cb) {
          orderDB.find({ user_id: mongoose.mongo.ObjectId(userId), firstCurrency: from, secondCurrency:to, status: { $in:['active', 'partially', 'stoplimit']}, ordertype:{$ne:'market'} }, {Price:1, Amount:1, fee_per:1, Type:1, ordertype:1, status:1, created_at:1}).sort({_id: -1}).exec(cb)
        },
        myHistory: function(cb) {
          mapDb.find({ firstCurrency: from, secondCurrency: to, $or: [{buyerUserId: mongoose.mongo.ObjectId(userId)}, {sellerUserId: mongoose.mongo.ObjectId(userId)}] }, {_id:0, sellerUserId:1, buyerUserId:1, askPrice:1, filledAmount:1, cancel_id:1, created_at:1, buy_fee:1, sell_fee:1}).sort({created_at: -1}).exec(cb)
        }
      }, function(err, results) {
        userRes.token = endecrypt.encryptNew(userId);
        userRes.fromBal = multiBal[from];
        userRes.toBal = multiBal[to];
        userRes.pair = from+'_'+to;
        if(results) {
          var open = results.allOrders.filter(item => item.status != 'stoplimit');
          var stop = results.allOrders.filter(item => item.status == 'stoplimit');
          var trade = results.myHistory;
          common.formatOpen(from, to, userId, open, function(openRes) {
            common.formatStop(from, to, userId, stop, function(stopRes) {
              common.formatMyTrade(from, to, userId, trade, function(myRes) {
                userRes.open = openRes;
                userRes.stop = stopRes;
                userRes.hist = myRes;
                socket.sockets.emit('userResponse', userRes);
              })
            })
          })
        } else {
          userRes.open = [];
          userRes.stop = [];
          userRes.hist = [];
          socket.sockets.emit('userResponse', userRes);
        }
      })
    }
  })
}

let cancelIOrder = exports.cancelOrder = (orderId, userId, callback) => {
  orderDB.findOne({ user_id:mongoose.mongo.ObjectId(userId), _id:mongoose.mongo.ObjectId(orderId), status: { $in:['active', 'partially', 'stoplimit']}}).exec(function(ordErr, ordRes) {
    if (ordRes) {
      var first = ordRes.firstCurrency;
      var second = ordRes.secondCurrency;
      var cliId = ordRes.clientOrder;
      var liqId = ordRes.orderId;
      if(ordRes.site == 'binance' && ordRes.orderId) {
        var pair = first+second;
        var trdPair = first+'-'+second;
        var params = {id: liqId};
        kuws.cancelOrder(params).then(canRes=>{ });
      }
      var amount = ordRes.Amount;
      var type = ordRes.Type.charAt(0).toUpperCase() + ordRes.Type.slice(1);
      var amount = ordRes.Amount;
      var feePer = ordRes.fee_per;
      var price = ordRes.Price;
      var status = ordRes.status;
      if(status == "active") { status = "partially"; }
      common.checkOrderTemp(status, type, mongoose.mongo.ObjectId(orderId), function(fillAmt) {
        var filled = parseFloat(amount) - parseFloat(fillAmt);
        var subtotal = filled * price;
        var feeAmt = (subtotal * feePer) / 100;
        var buyTotal = parseFloat(subtotal) + parseFloat(feeAmt);
        let orderJson = {
          askAmount: parseFloat(amount).toFixed(8), askPrice: parseFloat(price).toFixed(8), firstCurrency: first, secondCurrency: second, filledAmount: parseFloat(filled).toFixed(8), total: 0, cancel_id: userId, pair: first+'_'+second, datetime: new Date()
        };
        if(type == "Buy") {
          var balCur = second;
          var upTotal = buyTotal;
          orderJson.sellorderId = mongoose.mongo.ObjectId(0);
          orderJson.sellerUserId = mongoose.mongo.ObjectId(0);
          orderJson.buyorderId = mongoose.mongo.ObjectId(orderId);
          orderJson.buyerUserId = mongoose.mongo.ObjectId(userId);
          orderJson.buy_fee = parseFloat(feeAmt).toFixed(8);
          orderJson.sell_fee = 0;
          orderJson.cancel_order = "buy";
        } else {
          var balCur = first;
          var upTotal = filled;
          orderJson.sellorderId = mongoose.mongo.ObjectId(orderId);
          orderJson.sellerUserId = mongoose.mongo.ObjectId(userId);
          orderJson.buyorderId = mongoose.mongo.ObjectId(0);
          orderJson.buyerUserId = mongoose.mongo.ObjectId(0);
          orderJson.buy_fee = 0;
          orderJson.sell_fee = parseFloat(feeAmt).toFixed(8);
          orderJson.cancel_order = "sell";
        }
        common.findUserBalance(userId, balCur, function(balRes) {
          var balance = parseFloat(balRes);
          var upBal = parseFloat(upTotal) + balance;
          upBal = parseFloat(upBal).toFixed(8);
          mapDb.create(orderJson, function(insErr, insRes) {
            if(insRes) {
              orderDB.updateOne({_id:mongoose.mongo.ObjectId(orderId)}, {"$set":{status:'cancelled', updated_at:new Date()}}).exec(function(upErr,upRes) {
                if(upRes) {
                  common.updateUserBalance(userId, balCur, upBal, function(callRes) {
                    if(callRes) {

                      let notObj = {user_id:userId, category:"Exchange Order Cancellation", message:"Your exchange "+type+" order has been cancelled for "+amount+" "+first+" with price of "+price+" "+second, page:"trade"};
                      notify.create(notObj, function(notErr, notRes) {});

                      console.log({"userid":userId, "currency":balCur, "exist":balance, "new":upBal, "id":orderId, "type":"Order Cancel", "time":new Date()});
                      callback({ success:1 });
                      if(status == "stoplimit") {
                        _tradeMap._sendResponse(first, second, mongoose.mongo.ObjectId(userId), 'userEmit');
                      } else {
                        _tradeMap._sendResponse(first, second, mongoose.mongo.ObjectId(userId), 'pairEmit');
                      }
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

let binanceCronUp = exports.binanceCronUp = (from, to, userId, price, callback) => {
  // _tradeMap.updateTradePair(from, to, price);
  _tradeMap._sendResponse(from, to, userId, 'userEmit');
  _tradeMap._sendResponse(from, to, userId, 'pairEmit');
  // _tradeMap._checkStopOrder(from, to, price);
  callback(true)
}

let stopOrderUp = exports.stopOrderUp = (from, to, userId, price, callback) => {
  _tradeMap._sendResponse(from, to, userId, 'userEmit');
  callback(true)
}

let _binanceCompleteOrd = exports._binanceCompleteOrd = (id, type, from, to, userId, amount, price, feePer, Sts, callback) => {
  _tradeMap._completeOrder(id, type, from, to, userId, amount, price, feePer, Sts, function(resUp) {
    if(resUp){
      callback(true)
    } else{
      callback(false)
    }
  })
}

mapTrade.prototype.referral = (type, tradeFee, second, userId) => {
  try {
    userDB.findOne({_id:mongoose.mongo.ObjectId(userId), referrer_id:{$ne:""}},{referrer_id:1,username:1}).exec(function(Err, resData) {
      if(resData) {
        if(resData.referrer_id != "") {
          siteSettings.findOne({sitemode:1}, {refBasic:1, refLevel1:1, refLevel2:1}).exec(function(siteErr, commission) {
            var basCommission = commission.refBasic
            var oneCommission = commission.refLevel1
            var twoCommission = commission.refLevel2
            var profitCommission = 1 - commission.refBasic
            userDB.findOne({refer_id:resData.referrer_id},{referrer_id:1,_id:1,refer_id:1,username:1}).exec(function(oneErr, levelOne) {
              if(levelOne) {
                if(levelOne.referrer_id != "") {
                  userDB.findOne({refer_id:levelOne.referrer_id},{referrer_id:1,_id:1,refer_id:1,username:1}).exec(function(twoErr, levelTwo) {
                    if(levelTwo) {
                      var levelOneFee = tradeFee*oneCommission
                    } else {
                      var levelOneFee = tradeFee*basCommission
                    }
                    common.findUserBalance(levelOne._id, second, function(balResOne) {
                      var balanceOne = parseFloat(balResOne);
                      var upBalOne = balanceOne + parseFloat(levelOneFee);
                      upBalOne = parseFloat(upBalOne).toFixed(8);
                      common.updateUserBalance(levelOne._id, second, upBalOne, function(oneWallet) {
                        let refOneJson = {
                          user_id:mongoose.mongo.ObjectId(levelOne._id),
                          username:levelOne.username,
                          refer_id:mongoose.mongo.ObjectId(userId),
                          refer_name:resData.username,
                          amount:parseFloat(levelOneFee).toFixed(8),
                          currency:second,
                          type:type
                        }
                        referralDB.create(refOneJson, function(refErr, refRes) {})
                      })
                    })
                    if(levelTwo) {
                      var levelTwoFee = tradeFee*twoCommission
                      common.findUserBalance(levelTwo._id, second, function(balResTwo) { 
                        var balanceTwo = parseFloat(balResTwo);
                        var upBalTwo = balanceTwo + parseFloat(levelTwoFee);
                        upBalTwo = parseFloat(upBalTwo).toFixed(8);
                        common.updateUserBalance(levelTwo._id, second, upBalTwo, function(oneWallet) {
                          let refTwoJson = {
                            user_id:mongoose.mongo.ObjectId(levelTwo._id),
                            username:levelTwo.username,
                            refer_id:mongoose.mongo.ObjectId(userId),
                            refer_name:resData.username,
                            amount:parseFloat(levelTwoFee).toFixed(8),
                            currency:second,
                            type:type
                          }
                          referralDB.create(refTwoJson, function(refErr, refRes) {})
                        })
                      })
                    }

                    var profitFee = tradeFee*profitCommission
                    let profitJson = { type: type+" fees", user_id: mongoose.mongo.ObjectId(userId), currency: second, amount: parseFloat(profitFee).toFixed(8) }
                    profitDb.create(profitJson, function(profitErr, profitRes) {})
                  })
                } else {
                  var levelOneFee = tradeFee*basCommission
                  common.findUserBalance(levelOne._id, second, function(balResOne) {
                    var balanceOne = parseFloat(balResOne);
                    var upBalOne = balanceOne + parseFloat(levelOneFee);
                    upBalOne = parseFloat(upBalOne).toFixed(8);
                    common.updateUserBalance(levelOne._id, second, upBalOne, function(oneWallet) {
                      let refOneJson = {
                        user_id:mongoose.mongo.ObjectId(levelOne._id),
                        username:levelOne.username,
                        refer_id:mongoose.mongo.ObjectId(userId),
                        refer_name:resData.username,
                        amount:levelOneFee,
                        currency:second,
                        type:type
                      }
                      referralDB.create(refOneJson, function(refErr, refRes) {})
                    })
                  })
                  var profitFee = tradeFee*profitCommission
                  let profitJson = { type: type+" fees", user_id: mongoose.mongo.ObjectId(userId), currency: second, amount: parseFloat(profitFee).toFixed(8) }
                  profitDb.create(profitJson, function(profitErr, profitRes) {})
                }
              } else {
                let profitJson = { type: type+" fees", user_id: mongoose.mongo.ObjectId(userId), currency: second, amount: tradeFee }
                profitDb.create(profitJson, function(profitErr, profitRes) {})
              }
            })
})
} else {
  let profitJson = { type: type+" fees", user_id: mongoose.mongo.ObjectId(userId), currency: second, amount: tradeFee }
  profitDb.create(profitJson, function(profitErr, profitRes) {})
}
} else {
  let profitJson = { type: type+" fees", user_id: mongoose.mongo.ObjectId(userId), currency: second, amount: tradeFee }
  profitDb.create(profitJson, function(profitErr, profitRes) {})
}
})
} catch(e) {
  console.log('referral error: ',userId)
}
}

mapTrade.prototype.mappingLoop = (from, to, order, matchOrders, ind, callback) => {
  var orderId = order._id;
  var userId = order.user_id.toString();
  var Price = parseFloat(order.Price);
  var Amount = parseFloat(order.Amount);
  var Fee = parseFloat(order.Fee);
  var FeePer = order.fee_per;
  var Type = order.Type;
  if (Type == 'buy') {
    let sells = matchOrders[ind];
    var sellorderId = sells._id;
    var selluserId = sells.user_id.toString();
    var sellPrice = sells.Price;
    var sellAmount = sells.Amount;
    var sellFrom = from;
    var sellTo = to;
    var sellFee = sells.Fee;
    var sellFeePer = sells.fee_per;
    var sellTotal = sells.Total;
    var approxiAmount = sellAmount - sells.filledAmount;
    approxiAmount = parseFloat(approxiAmount).toFixed(8);
    common.checkOrderTemp("partially", "Buy", orderId, function(fillAmt) {
      fillAmt = parseFloat(fillAmt);
      var buySumamount = Amount - fillAmt;
      buySumamount = parseFloat(buySumamount).toFixed(8);
      approxiAmount = parseFloat(approxiAmount);
      buySumamount = parseFloat(buySumamount);
      var amount = (approxiAmount >= buySumamount) ? buySumamount : approxiAmount;
      amount = parseFloat(amount);
      if(approxiAmount > 0 && buySumamount > 0) {
        if (orderId > sellorderId) {
          var tradePrice = sellPrice;
          var returnBuy = (Price > sellPrice) ? 1 : 0;
        } else {
          var tradePrice = Price;
          var returnBuy = 0;
        }
        var total = amount * tradePrice;
        var buyFeeAmt = (total * FeePer) / 100;
        var sellFeeAmt = (total * sellFeePer) / 100;
        let tempJson = {
          sellorderId: sellorderId, sellerUserId: mongoose.mongo.ObjectId(selluserId), askAmount: amount.toFixed(8), askPrice: parseFloat(tradePrice).toFixed(8), firstCurrency: from, secondCurrency: to, filledAmount: amount.toFixed(8), buyorderId: orderId, buyerUserId: mongoose.mongo.ObjectId(userId), buy_fee: parseFloat(buyFeeAmt).toFixed(8), sell_fee: parseFloat(sellFeeAmt).toFixed(8), total: parseFloat(total).toFixed(8), pair: from+'_'+to
        };
        mapDb.create(tempJson, function(tempErr, tempRes)  {
          if (returnBuy == 1) {
            var price1 = amount * sellPrice;
            var price2 = amount * Price;
            var addPrice = price2 - price1;
            var tradeFee = addPrice * FeePer / 100;
            common.findUserBalance(userId, to, function(buyBal) {
              var buyUp = parseFloat(buyBal) + parseFloat(addPrice) + parseFloat(tradeFee);
              common.updateUserBalance(userId, to, parseFloat(buyUp).toFixed(8), function(bu){
                common.checkBalUpdates(userId, to, buyBal, buyUp, "Buy user balance return");
              });
            })
          }
          var sellSts = (approxiAmount == amount) ? "filled" : "partially";
          var buySts = (approxiAmount >= buySumamount) ? "filled" : "partially";
          _tradeMap._completeOrder(sellorderId, "sell", from, to, selluserId, amount, tradePrice, sellFeePer, sellSts, function(sellUp) {
            if(sellUp) {
              _tradeMap._sendResponse(from, to, selluserId, 'userEmit');
              _tradeMap._completeOrder(orderId, "buy", from, to, userId, amount, tradePrice, FeePer, buySts, function(buyUp) {
                if(buyUp) {
                  _tradeMap._sendResponse(from, to, userId, 'pairEmit');
                  _tradeMap.updateTradePair(from, to, tradePrice);
                  let indAdd = ind + 1;
                  if(buySts == "partially" && matchOrders[indAdd] != undefined) {
                    _tradeMap.mappingLoop(from, to, order, matchOrders, indAdd, (mapRes) => {})
                  } else {
                    _tradeMap._checkStopOrder(from, to, tradePrice);
                  }
                }
              })
            }
          })
        });
      } else {
        _tradeMap._sendResponse(from, to, userId, 'userEmit');
        return;
      }
    });
  } else {
    let buys = matchOrders[ind];
    var buyorderId = buys._id;
    var buyuserId = buys.user_id.toString();
    var buyPrice = buys.Price;
    var buyAmount = buys.Amount;
    var buyFrom = from;
    var buyTo = to;
    var buyFee = buys.Fee;
    var buyFeePer = buys.fee_per;
    var buyTotal = buys.Total;
    var approxiAmount = buyAmount - buys.filledAmount;
    approxiAmount = parseFloat(approxiAmount).toFixed(8);
    common.checkOrderTemp("partially", "Sell", orderId, function(fillAmt) {
      fillAmt = parseFloat(fillAmt);
      var sellSumamount = Amount - fillAmt;
      sellSumamount = parseFloat(sellSumamount).toFixed(8);
      approxiAmount = parseFloat(approxiAmount);
      sellSumamount = parseFloat(sellSumamount);
      var amount = (approxiAmount >= sellSumamount) ? sellSumamount : approxiAmount;
      amount = parseFloat(amount);
      if(approxiAmount > 0 && sellSumamount > 0) {
        if (buyorderId > orderId) {
          var tradePrice = Price;
          var returnBuy = (buyPrice > Price) ? 1 : 0;
        } else {
          var tradePrice = buyPrice;
          var returnBuy = 0;
        }
        var total = amount * tradePrice;
        var buyFeeAmt = (total * buyFeePer) / 100;
        var sellFeeAmt = (total * FeePer) / 100;
        let tempJson = {
          sellorderId: orderId, sellerUserId: mongoose.mongo.ObjectId(userId), askAmount: amount.toFixed(8), askPrice: parseFloat(tradePrice).toFixed(8), firstCurrency: from, secondCurrency: to, filledAmount: amount.toFixed(8), buyorderId: buyorderId, buyerUserId: mongoose.mongo.ObjectId(buyuserId), buy_fee: parseFloat(buyFeeAmt).toFixed(8), sell_fee: parseFloat(sellFeeAmt).toFixed(8), total: parseFloat(total).toFixed(8), pair: from+'_'+to
        };
        mapDb.create(tempJson, function(tempErr, tempRes)  {
          if (returnBuy == 1) {
            var price1 = amount * Price;
            var price2 = amount * buyPrice;
            var addPrice = price2 - price1;
            var tradeFee = addPrice * buyFeePer / 100;
            common.findUserBalance(buyuserId, to, function(buyBal) {
              var buyUp = parseFloat(buyBal) + parseFloat(addPrice) + parseFloat(tradeFee);
              common.updateUserBalance(buyuserId, to, parseFloat(buyUp).toFixed(8), function(bu){
                common.checkBalUpdates(buyuserId, to, buyBal, buyUp, "Buy user balance return");
              });
            })
          }
          var buySts = (approxiAmount == amount) ? "filled" : "partially";
          var sellSts = (approxiAmount >= sellSumamount) ? "filled" : "partially";
          _tradeMap._completeOrder(buyorderId, "buy", from, to, buyuserId, amount, tradePrice, buyFeePer, buySts, function(buyUp) {
            if(buyUp) {
              _tradeMap._sendResponse(from, to, buyuserId, 'userEmit');
              _tradeMap._completeOrder(orderId, "sell", from, to, userId, amount, tradePrice, FeePer, sellSts, function(sellUp) {
                if(sellUp) {
                  _tradeMap._sendResponse(from, to, userId, 'pairEmit');
                  _tradeMap.updateTradePair(from, to, tradePrice);
                  let indAdd = ind + 1;
                  if(sellSts == "partially" && matchOrders[indAdd] != undefined) {
                    _tradeMap.mappingLoop(from, to, order, matchOrders, indAdd, (mapRes) => {})
                  } else {
                    _tradeMap._checkStopOrder(from, to, tradePrice);
                  }
                }
              })
            }
          })
        });
      } else {
        _tradeMap._sendResponse(from, to, userId, 'userEmit');
        return;
      }
    });
  }
}

mapTrade.prototype.marketMap = (lastOrder, from, to, minAmt, liq="", ind=0, resp={}, callback) => {
  if (lastOrder.Type == 'buy') {
    var getWhere = { firstCurrency:from, secondCurrency:to, Type:'sell', user_id: { $ne:lastOrder.user_id }, status: { $in:['active', 'partially']} };
    var sortArr = { Price:1, _id:1 };
    var lookCon = { from:'ordertemp', localField:'_id', foreignField:'sellorderId', as:'OT' };
  } else {
    var getWhere = { firstCurrency:from, secondCurrency:to, Type:'buy', user_id: { $ne:lastOrder.user_id }, status: { $in:['active', 'partially']} };
    var sortArr = { Price:-1, _id:1 };
    var lookCon = { from:'ordertemp', localField:'_id', foreignField:'buyorderId', as:'OT' };
  }
  orderDB.aggregate([
    { $lookup : lookCon },
    { $match : getWhere },
    { $project : { _id:'$_id', user_id:'$user_id', Price:'$Price', Amount:'$Amount', Fee:'$Fee', fee_per:'$fee_per', Total:'$Total', filledAmount:{ $sum:'$OT.filledAmount' } } },
    { $group : { _id:'$_id', user_id:{ $first:'$user_id' }, Price:{ $first:'$Price' }, Amount:{ $first:'$Amount' }, Fee:{ $first:'$Fee' }, fee_per:{ $first:'$fee_per' }, Total:{ $first:'$Total' }, filledAmount:{ $sum:'$filledAmount' } } },
    { $sort:sortArr },
    { $limit : 1 }
    ]).exec(function(activeErr, activeRes) {
      if (activeRes.length > 0) {
        if(ind == 0) {
          socket.sockets.emit('createResponse', resp);
        }
        _tradeMap.marketLoop(from, to, lastOrder, activeRes, minAmt, 0, resp, (mapRes) => {})
      } else {
        if(ind == 0) {
          let ordType = lastOrder.Type;
          let oppType = (ordType == 'buy') ? "Sell" : "Buy";
          resp['success'] = 0;
          resp['msg'] = "No "+oppType+" orders at the moment"; 
          return _tradeMap._createResponse(resp);
        } else {
          let orderId = lastOrder._id;
          let userId = lastOrder.user_id.toString();
          let Type = lastOrder.Type;
          let checkType = (Type == 'buy') ? "Buy" : "Sell";
          common.checkOrderTemp("partially", checkType, orderId, function(fillAmt) {
            fillAmt = parseFloat(fillAmt);
            let upSts = (fillAmt > 0) ? "filled" : "noorder";
            orderDB.updateOne({_id:orderId}, {"$set":{status:upSts, Amount:fillAmt.toFixed(8), updated_at:new Date()}}).exec(function(upErr,upRes) {
              _tradeMap._sendResponse(from, to, userId, 'pairEmit');
            });
          })
        }
      }
    })
  }

mapTrade.prototype.marketLoop = (from, to, order, matchOrders, minAmt, ind, resp = {}, callback) => {
  let orderId = order._id;
  let userId = order.user_id.toString();
  let Price = parseFloat(order.Price);
  let Amount = parseFloat(order.Amount);
  let Fee = parseFloat(order.Fee);
  let FeePer = order.fee_per;
  let Type = order.Type;
  if (matchOrders[ind] == undefined) {
    let checkType = (Type == 'buy') ? "Buy" : "Sell";
    common.checkOrderTemp("partially", checkType, orderId, function(fillAmt) {
      fillAmt = parseFloat(fillAmt);
      let upSts = (fillAmt > 0) ? "filled" : "noorder";
      orderDB.updateOne({_id:orderId}, {"$set":{status:upSts, Amount:fillAmt.toFixed(8), updated_at:new Date()}}).exec(function(upErr,upRes) {
        _tradeMap._sendResponse(from, to, userId, 'userEmit');
      });
    })
  } else {
    if (Type == 'buy') {
      let sells = matchOrders[ind];
      let sellorderId = sells._id;
      let selluserId = sells.user_id.toString();
      let sellPrice = sells.Price;
      let sellAmount = sells.Amount;
      let sellFrom = from;
      let sellTo = to;
      let sellFee = sells.Fee;
      let sellFeePer = sells.fee_per;
      let approxiAmount = sellAmount - sells.filledAmount;
      approxiAmount = parseFloat(approxiAmount).toFixed(8);
      common.checkOrderTemp("partially", "Buy", orderId, function(fillAmt) {
        fillAmt = parseFloat(fillAmt);
        let buySumamount = Amount - fillAmt;
        buySumamount = parseFloat(buySumamount).toFixed(8);
        approxiAmount = parseFloat(approxiAmount);
        buySumamount = parseFloat(buySumamount);
        if (buySumamount <= 0) {
          if(fillAmt > 0) {
            orderDB.updateOne({_id:orderId}, {"$set":{status:"filled", Amount:fillAmt.toFixed(8), updated_at:new Date()}}).exec(function(upErr,upRes) {
              _tradeMap._sendResponse(from, to, userId, 'userEmit');
            });
          }
          return;
        } else {
          let amount = (approxiAmount >= buySumamount) ? buySumamount : approxiAmount;
          amount = parseFloat(amount);
          common.findUserBalance(userId, to, function(sBalance) {
            sBalance = parseFloat(sBalance);
            let sellTotal = amount * sellPrice;
            let tradeFee = sellTotal * FeePer / 100;
            let marketTotal = parseFloat(sellTotal) + parseFloat(tradeFee);
            if (sBalance < marketTotal) {
              if(sBalance > 0) {
                let calFee = sBalance * FeePer / 100;
                let checkBal = sBalance - calFee;
                let calAmount = sBalance / ((1 + FeePer / 100) * sellPrice);
                let minFee = (calAmount * sellPrice) * FeePer / 100;
                let finalAmount = (calAmount * sellPrice) + minFee;
                calAmount = parseFloat(calAmount).toFixed(8);
                minFee = parseFloat(minFee).toFixed(8);
                finalAmount = parseFloat(finalAmount).toFixed(8);
                if(calAmount < parseFloat(minAmt)) {
                  if(fillAmt > 0) {
                    orderDB.updateOne({_id:orderId}, {"$set":{status:"filled", Amount:fillAmt.toFixed(8), updated_at:new Date()}}).exec(function(upErr,upRes) {
                      _tradeMap._sendResponse(from, to, userId, 'userEmit');
                    });
                  }
                } else {
                  let trdAmount = parseFloat(calAmount) + parseFloat(fillAmt);
                  trdAmount = parseFloat(trdAmount).toFixed(8);
                  orderDB.updateOne({_id:orderId}, {"$set":{status:"active", Amount:trdAmount, Price:sellPrice, Fee:minFee, Total:finalAmount, updated_at:new Date()}}).exec(function(upErr,upRes) {
                    let remainBal = sBalance - finalAmount;
                    common.updateUserBalance(userId, to, remainBal, function(callRes) {
                      let newOrder = { _id:orderId, user_id:userId, Price:sellPrice, Amount:trdAmount, status:"active", Fee:minFee, fee_per:FeePer, Type:Type };
                      _tradeMap.mapOrder(newOrder, from, to, function(res) {});
                    })
                  });
                }
              }
              return;
            } else {
              let remainBal = sBalance - marketTotal;
              common.updateUserBalance(userId, to, remainBal, function(callRes) {
                if(callRes) {
                  console.log({"userid":userId, "currency":to, "exist":sBalance, "new":remainBal, "id":orderId.toString(), "type":"Market Buy Order Place", "time":new Date()});
                  if(approxiAmount > 0 && buySumamount > 0) {
                    let tradePrice = sellPrice;
                    let total = amount * tradePrice;
                    let buyFeeAmt = (total * FeePer) / 100;
                    let sellFeeAmt = (total * sellFeePer) / 100;
                    let tempJson = {
                      sellorderId: sellorderId, sellerUserId: mongoose.mongo.ObjectId(selluserId), askAmount: amount.toFixed(8), askPrice: parseFloat(tradePrice).toFixed(8), firstCurrency: from, secondCurrency: to, filledAmount: amount.toFixed(8), buyorderId: orderId, buyerUserId: mongoose.mongo.ObjectId(userId), buy_fee: parseFloat(buyFeeAmt).toFixed(8), sell_fee: parseFloat(sellFeeAmt).toFixed(8), total: parseFloat(total).toFixed(8), pair: from+'_'+to
                    };
                    mapDb.create(tempJson, function(tempErr, tempRes)  {
                      let sellSts = (approxiAmount == amount) ? "filled" : "partially";
                      let buySts = (approxiAmount >= buySumamount) ? "filled" : "partially";
                      _tradeMap._completeOrder(sellorderId, "sell", from, to, selluserId, amount, tradePrice, sellFeePer, sellSts, function(sellUp) {
                        if(sellUp) {
                          _tradeMap._sendResponse(from, to, selluserId, 'userEmit');
                          _tradeMap._completeOrder(orderId, "buy", from, to, userId, amount, tradePrice, FeePer, buySts, function(buyUp) {
                            if(buyUp) {
                              _tradeMap.updateTradePair(from, to, tradePrice);
                              let indAdd = ind + 1;
                              if(buySts == "partially") {
                                _tradeMap._sendResponse(from, to, userId, 'pairEmit');
                                _tradeMap.marketMap(order, from, to, minAmt, "", indAdd, resp, function(res) {});
                              // _tradeMap.marketLoop(from, to, order, matchOrders, minAmt, indAdd, (mapRes) => {})
                              } else {
                                _tradeMap._sendResponse(from, to, userId, 'pairEmit');
                                _tradeMap._checkStopOrder(from, to, tradePrice);
                              }
                            }
                          })
                        }
                      })
                    });
                  } else {
                    _tradeMap._sendResponse(from, to, userId, 'userEmit');
                    return;
                  }
                }
              })
            }
          });
        }
      });
    } else {
      let buys = matchOrders[ind];
      let buyorderId = buys._id;
      let buyuserId = buys.user_id.toString();
      let buyPrice = buys.Price;
      let buyAmount = buys.Amount;
      let buyFrom = from;
      let buyTo = to;
      let buyFee = buys.Fee;
      let buyFeePer = buys.fee_per;
      let buyTotal = buys.Total;
      let approxiAmount = buyAmount - buys.filledAmount;
      approxiAmount = parseFloat(approxiAmount).toFixed(8);
      common.checkOrderTemp("partially", "Sell", orderId, function(fillAmt) {
        fillAmt = parseFloat(fillAmt);
        let sellSumamount = Amount - fillAmt;
        sellSumamount = parseFloat(sellSumamount).toFixed(8);
        approxiAmount = parseFloat(approxiAmount);
        sellSumamount = parseFloat(sellSumamount);
        if (sellSumamount <= 0) {
          if(fillAmt > 0) {
            orderDB.updateOne({_id:orderId}, {"$set":{status:"filled", Amount:fillAmt.toFixed(8), updated_at:new Date()}}).exec(function(upErr,upRes) {
              _tradeMap._sendResponse(from, to, userId, 'userEmit');
            });
          }
          return;
        } else {
          let amount = (approxiAmount >= sellSumamount) ? sellSumamount : approxiAmount;
          amount = parseFloat(amount);
          common.findUserBalance(userId, from, function(fBalance) {
            fBalance = parseFloat(fBalance);
            let remainBal = (approxiAmount < sellSumamount) ? fBalance - approxiAmount : fBalance - sellSumamount;
            remainBal = parseFloat(remainBal).toFixed(8);
            common.updateUserBalance(userId, from, remainBal, function(callRes) {
              if(callRes) {
                console.log({"userid":userId, "currency":from, "exist":fBalance, "new":remainBal, "id":orderId.toString(), "type":"Market Sell Order Place", "time":new Date()});
                if(approxiAmount > 0 && sellSumamount > 0) {
                  let tradePrice = buyPrice;
                  let total = amount * tradePrice;
                  let buyFeeAmt = (total * buyFeePer) / 100;
                  let sellFeeAmt = (total * FeePer) / 100;
                  let tempJson = {
                    sellorderId: orderId, sellerUserId: mongoose.mongo.ObjectId(userId), askAmount: amount.toFixed(8), askPrice: parseFloat(tradePrice).toFixed(8), firstCurrency: from, secondCurrency: to, filledAmount: amount.toFixed(8), buyorderId: buyorderId, buyerUserId: mongoose.mongo.ObjectId(buyuserId), buy_fee: parseFloat(buyFeeAmt).toFixed(8), sell_fee: parseFloat(sellFeeAmt).toFixed(8), total: parseFloat(total).toFixed(8), pair: from+'_'+to
                  };
                  mapDb.create(tempJson, function(tempErr, tempRes)  {
                    let buySts = (approxiAmount == amount) ? "filled" : "partially";
                    let sellSts = (approxiAmount >= sellSumamount) ? "filled" : "partially";
                    _tradeMap._completeOrder(buyorderId, "buy", from, to, buyuserId, amount, tradePrice, buyFeePer, buySts, function(buyUp) {
                      if(buyUp) {
                        _tradeMap._sendResponse(from, to, buyuserId, 'userEmit');
                        _tradeMap._completeOrder(orderId, "sell", from, to, userId, amount, tradePrice, FeePer, sellSts, function(sellUp) {
                          if(sellUp) {
                            _tradeMap.updateTradePair(from, to, tradePrice);
                            let indAdd = ind + 1;
                            if(sellSts == "partially") {
                              _tradeMap._sendResponse(from, to, userId, 'pairEmit');
                              _tradeMap.marketMap(order, from, to, minAmt, "", indAdd, resp, function(res) {});
                              // _tradeMap.marketLoop(from, to, order, matchOrders, minAmt, indAdd, (mapRes) => {})
                            } else {
                              _tradeMap._sendResponse(from, to, userId, 'pairEmit');
                              _tradeMap._checkStopOrder(from, to, tradePrice);
                            }
                          }
                        })
                      }
                    })
                  });
                } else {
                  _tradeMap._sendResponse(from, to, userId, 'userEmit');
                  return;
                }
              }
            })
          })
        }
      });
    }
  }
}

mapTrade.prototype._checkStopOrder = (first, second, price) => {
  let sellWhere = { status:"stoplimit", firstCurrency:first, secondCurrency:second, Type:'sell', Price:{ $gte:price } };
  let buyWhere = { status:"stoplimit", firstCurrency:first, secondCurrency:second, Type:'buy', Price:{ $lte:price } };
  var ordersLists = [];
  orderDB.find(sellWhere).exec(function(stopErr, ordersList) {
    orderDB.find(buyWhere).exec(function(stopErr1, ordersList1) {
      if (ordersList.length > 0) { ordersLists = ordersLists.concat(ordersList); }
      if (ordersList1.length > 0) { ordersLists = ordersLists.concat(ordersList1); }
      if (ordersLists.length > 0) {
        ordersLists.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        for (let j = 0; j < ordersLists.length; j++) {
          (function() {
            let i = j;
            let _id = ordersLists[i]._id
            orderDB.updateOne({_id:_id}, {$set:{status:'active', updated_at:new Date()}}, {multi:true}).exec(function(stopError, stopRes) {
              if (stopRes) {
                _tradeMap.mapOrder(ordersLists[i], first, second, (loopRes) => {});
              }
            })
          })()
        }
      }
    })
  })
}

let activateStop = exports.activateStop = (first, second, price) => {
  let sellWhere = { status:"stoplimit", firstCurrency:first, secondCurrency:second, Type:'sell', stop_price:{ $lte:price } };
  let buyWhere = { status:"stoplimit", firstCurrency:first, secondCurrency:second, Type:'buy', stop_price:{ $gte:price } };
  var ordersLists = [];
  orderDB.find(sellWhere).exec(function(stopErr, ordersList) {
    orderDB.find(buyWhere).exec(function(stopErr1, ordersList1) {
      if (ordersList && ordersList.length > 0) { ordersLists = ordersLists.concat(ordersList); }
      if (ordersList1 && ordersList1.length > 0) { ordersLists = ordersLists.concat(ordersList1); }
      if (ordersLists.length > 0) {
        ordersLists.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        for (let j = 0; j < ordersLists.length; j++) {
          (function() {
            let i = j;
            let _id = ordersLists[i]._id

            orderDB.findOneAndUpdate({_id:_id, site:'binance', status:'stoplimit'}, {$set:{status:"active", updated_at:new Date()}}).exec(function(upErr, upRes) {
              if(upRes != undefined) {
                _tradeMap._sendResponse(first, second, upRes.user_id.toString(), 'userEmit');
                _tradeMap._sendResponse(first, second, upRes.user_id.toString(), 'pairEmit');
              }
            });
          })()
        }
      }
    })
  })
}