const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const validator = require('validator');
const async = require('async');
const multer = require('multer');
const cron = require('node-cron');

const common = require('../../helpers/common');
const p2pHlp = require('../../helpers/p2p');
const encdec = require('../../helpers/newendecryption');
const cloudinary = require('../../helpers/cloudinary');
const mail = require('../../helpers/mail');

const pairDb = require('../../model/p2pPairs');
const orderDb = require('../../model/p2pCoinOrder');
const mapDb = require('../../model/p2pOrdertemp');
const users = require('../../model/users');
const userBank = require('../../model/userbank');
const notify = require('../../model/notify');
const currency = require('../../model/currency');
const escrowDb = require('../../model/p2pEscrow');
const disputeDb = require('../../model/p2pDispute');

//upload  storage
var storage = multer.diskStorage({
  filename: function (req, file, cb) {
    cb(null, common.randomString(8) + new Date().getTime() + file.originalname);
  }
});
var upload = multer({ storage: storage });

router.get('/getPairs', common.userVerify, (req, res) => {
  let userId = req.userId;
  async.parallel({
    pairRes: function(cb) {
      pairDb.find({status:1}, {_id:0, from_symbol:1, to_symbol:1, pair_name:1, last_price:1, min_amt:1, max_amt:1, min_price:1, max_price:1, amt_decimal:1, decimal:1}).exec(cb);
    },
    userInfo:function(cb) {
      users.findOne({_id:userId}, {_id:0, xid:1}).exec(cb)
    },
  }, function(err, result) {
    if(result) {
      if(result.userInfo) {
        res.json({success:1, pairs:result.pairRes, xid:result.userInfo.xid, token:encdec.encryptNew(userId.toString())});
      } else {
        res.json({success:0, pairs:[], xid:""});
      }
    } else {
      res.json({success:0, pairs:[], xid:""});
    }
  });
});

router.post('/pairDetails', common.userVerify, (req, res) => {
  let info = req.body;
  let userId = req.userId;
  p2pHlp.getP2pInfo({from:info.from, to:info.to}, (pairData) => {
    userBank.findOne({user_id:userId, currency:info.to, status:1}, {_id:1}).exec(function(bankErr, bankRes) {
      let sts = (bankRes) ? 1 : 0;
      res.json({success:1, result:pairData, status:sts});
    });
  });
});

router.post('/createXid', common.userVerify, (req, res) => {
  let info = req.body;
  let userId = req.userId;
  let xid = info.xid;
  users.findOne({xid:xid}, {_id:1}).exec(function (err, userRes) {
    if(userRes) {
      res.json({success:0, msg:"XID already exists"});
    } else {
      users.updateOne({_id:userId}, {"$set":{xid:xid}}).exec(function(upErr, upRes) {
        if(upRes) {
          let notObj = {user_id:userId, category:"Create XID", message:"Your own XID has been created for for P2P.", page:"p2p"};
          notify.create(notObj, function(notErr, notRes) {});
          res.json({success:1});
        } else {
          res.json({success:0, msg:"Failed to create XID"});
        }
      });
    }
  });
});

var mapP2p = function() {};
let _p2pMap = new mapP2p();
var usrListArr = []; let cancelOrderId = [];

mapP2p.prototype._unsetUsrId = (usrTkn) => {
  let index = usrListArr.indexOf(usrTkn);
  if(index > -1) {
    usrListArr.splice(index, 1);
  }
}

router.post('/placeOrder', common.userVerify, (req, res) => {
  let info = req.body;
  let userId = req.userId;
  let pair = info.pair;
  var pairs = pair.split('_');
  if(pairs.length != 2) { return res.json({success:0, msg:"Invalid pair"}); }
  let from = pairs[0];
  let to = pairs[1];
  let type = info.type;
  let preferXid = info.prefer_xid;
  let amount = parseFloat(info.amount);
  let price = parseFloat(info.price);
  var usrTkn = usrListArr.indexOf(userId.toString());
  if(usrTkn == -1) {
    usrListArr.push(userId.toString());
    setTimeout(_p2pMap._unsetUsrId, 10000, userId.toString());

    users.findOne({_id:mongoose.mongo.ObjectId(userId), status:1}, {_id:0, xid:1}).exec(function (usrErr, usrData) {
      if(usrData) {
        let usrXid = usrData.xid;
        if(usrXid == "") {
          return res.json({success:0, msg:"Please create your own XID"});
        } else {
          pairDb.find({from_symbol:from, to_symbol:to}, {_id:0, last_price:1, min_amt:1, min_price:1, max_price:1, decimal:1}).exec(function(pairErr, pairRes) {
            if(pairRes) {
              let deci = pairRes.decimal;
              if(amount < pairRes.min_amt) {return res.json({success:0, msg:"Minimum amount is "+pairRes.min_amt+" "+from});}
              if(price < pairRes.min_price) {return res.json({success:0, msg:"Minimum price is "+pairRes.min_price+" "+to});}
              if(price > pairRes.max_price) {return res.json({success:0, msg:"Maximum price is "+pairRes.max_price+" "+to});}
              var balCurr = (type == "buy") ? to : from;
              var total = amount * price;
              total = parseFloat(total).toFixed(deci);
              common.findUserBalance(userId, balCurr, function(balRes) {
                var balance = parseFloat(balRes);
                var upBal = balance - amount;
                if (amount > balance && type == "sell") {
                  return res.json({success:0, msg:"Insufficient Balance"});
                }
                let ordId = "trok-"+common.lowerString(4)+new Date().getTime()+common.lowerString(4)+'-'+common.lowerString(5)+'-'+common.lowerString(7);
                let mt = new Date(); mt.setHours( mt.getHours() + 1 );
                let pt = new Date(); pt.setHours( pt.getHours() + 2 );
                let ct = new Date(); ct.setHours( ct.getHours() + 4 );
                let dt = new Date(); dt.setHours( dt.getHours() + 4 );
                let ordObj = {
                  user_id : mongoose.mongo.ObjectId(userId),
                  order_id : ordId,
                  firstCurrency : from,
                  secondCurrency : to,
                  pair : pair,
                  Amount : amount,
                  Price : price,
                  Type : type,
                  Total : total,
                  status : 'active',
                  pagestatus : 'wait',
                  xid : usrXid,
                  prefer_xid : preferXid
                }
                orderDb.create(ordObj, function(ordErr, ordRes) {
                  if(ordRes) {
                    let notObj = {user_id:userId, category:"P2P Order Creation", message:"Your P2P "+type+" order has been created for "+amount.toFixed(8)+" "+from+" with payment of "+parseFloat(total).toFixed(2)+" "+to, page:"p2p"};
                    notify.create(notObj, function(notErr, notRes) {});
                    if(type == "sell") {
                      common.updateUserBalance(userId, from, upBal, function(upRes) {
                        console.log({"userid":userId, "currency":from, "exist":balance, "new":upBal, "id":ordRes._id.toString(), "type":"P2P Order place", "time":new Date()});
                        p2pHlp.p2pPairEmit({userId:userId.toString(), from:from, to:to});
                        res.json({success:1, msg:"Order placed", order_id:ordId});
                      });
                    } else {
                      p2pHlp.p2pPairEmit({userId:userId.toString(), from:from, to:to});
                      res.json({success:1, msg:"Order placed", order_id:ordId});
                    }
                  } else {
                    res.json({success:0, msg:"Failed to create an order"});   
                  }
                });
              });
            } else {
              res.json({success:0, msg:"Invalid request"});
            }
          });
        }
      } else {
        res.json({success:0, msg:"Invalid user"});
      }
    });
  } else {
    res.json({success:0, msg:"Place order after 10 seconds"});
  }
});

router.post('/cancelOrder', common.userVerify, (req, res) => {
  try {
    let userId = req.userId;
    var usrTkn = cancelOrderId.indexOf(userId);
    if(usrTkn == -1) {
      cancelOrderId.push(userId);
      let oId = req.body.ttoken;
      p2pHlp.cancelOrder(oId, userId, (resOrder) => {
        var index = cancelOrderId.indexOf(userId);
        if (index > -1) { cancelOrderId.splice(index, 1); }
        return res.json(resOrder);
      });
    } else {
      return res.json({success:0, msg: "Please try again"});
    }
  } catch (e) {
    return res.json({success:401, msg:"Something went wrong"});
  }
});

router.post('/bankDetails', common.userVerify, (req, res) => {
  try {
    let info = req.body;
    let userId = mongoose.mongo.ObjectId(req.userId);
    if(info.order_id != undefined) {
      orderDb.findOne({order_id:info.order_id, user_id:userId}, {_id:1, matchid:1, Type:1, secondCurrency:1}).exec(function(ordErr, ordRes) {
        if(ordRes) {
          let type = ordRes.Type;
          let matchId = ordRes.matchid;
          let secCurr = ordRes.secondCurrency;
          let buyId = (type == "buy") ? ordRes._id : matchId;
          let sellId = (type == "sell") ? ordRes._id : matchId;
          if(matchId != undefined) {
            orderDb.findOne({_id:matchId}, {user_id:1}).exec(function(matErr, matRes) {
              let oppUser = matRes.user_id;
              userBank.aggregate([
                { $match : { user_id : {$in:[userId, oppUser]}, currency:secCurr, status:1 } },
                { $project : { user_id:'$user_id', acc_name:'$acc_name', bank_name:'$bank_name', acc_number:'$acc_number', acc_type:'$acc_type', bank_code:'$bank_code' } },
                { $group : { _id:'$user_id', acc_name:{ $first:'$acc_name' }, bank_name:{ $first:'$bank_name' }, acc_number:{ $first:'$acc_number' }, acc_type:{ $first:'$acc_type' }, bank_code:{ $first:'$bank_code' } } },
                ]).exec(function(bankErr, bankRes) {
                  escrowDb.findOne({sellorderId:sellId, buyorderId:buyId}, {_id:0, buy_status:1, sell_status:1, remarks:1}).exec(function(escErr, escRes) {
                    if(escRes) {
                      let escr = { buyer:escRes.buy_status, seller:escRes.sell_status, remarks:escRes.remarks };
                      let filter = bankRes.filter(item => item._id.toString() == userId.toString());
                      let filter1 = bankRes.filter(item => item._id.toString() == oppUser.toString());
                      var buyName; var sellBank;
                      if(type == "buy") {
                        if(filter.length > 0) {
                          buyName = filter[0].acc_name;
                          sellBank = { name:filter1[0].acc_name, bank_name: filter1[0].bank_name, number:filter1[0].acc_number, code:filter1[0].bank_code, type:filter1[0].acc_type};
                          res.json({success:1, buyBank:buyName, sellBank:sellBank, payinfo:escr});
                        } else {
                          users.findOne({_id:userId}, {_id:0, firstname:1, lastname:1}).exec(function (usrErr, usrData) {
                            buyName = usrData.firstname+" "+usrData.lastname;
                            sellBank = { name:filter1[0].acc_name, bank_name: filter1[0].bank_name, number:filter1[0].acc_number, code:filter1[0].bank_code, type:filter1[0].acc_type };
                            res.json({success:1, buyBank:buyName, sellBank:sellBank, payinfo:escr});
                          });
                        }
                      } else {
                        if(filter1.length > 0) {
                          buyName = filter1[0].acc_name;
                          sellBank = { name:filter[0].acc_name, bank_name: filter1[0].bank_name, number:filter[0].acc_number, code:filter[0].bank_code, type:filter[0].acc_type };
                          res.json({success:1, buyBank:buyName, sellBank:sellBank, payinfo:escr});
                        } else {
                          users.findOne({_id:oppUser}, {_id:0, firstname:1, lastname:1}).exec(function (usrErr, usrData) {
                            buyName = usrData.firstname+" "+usrData.lastname;
                            sellBank = { name:filter[0].acc_name, bank_name: filter1[0].bank_name, number:filter[0].acc_number, code:filter[0].bank_code, type:filter[0].acc_type };
                            res.json({success:1, buyBank:buyName, sellBank:sellBank, payinfo:escr});
                          });
                        }
                      }
                    } else {
                      res.json({success:0, msg:"No matching records"});
                    }
                  })
                });
              });
          } else {
            res.json({success:0, msg:"Order not matched"});
          }
        } else {
          res.json({success:0, msg:"Invalid request"});
        }
      });
    } else {
      res.json({success:0, msg:"Please try again"});
    }
  } catch (e) {
    return res.json({success:401, msg:"Something went wrong"});
  }
});

router.post('/getOrderInfo', common.userVerify, (req, res) => {
  let info = req.body;
  let userId = req.userId;
  let ordId = info.order_id;
  orderDb.findOne({order_id:ordId, user_id:mongoose.mongo.ObjectId(userId)}, {_id:1, user_id:1, order_id:1, Amount:1, filledAmount:1, Price:1, Type:1, pair:1, status:1, created_at:1, pagestatus:1, firstCurrency:1, secondCurrency:1, prefer_xid:1, xid:1, matchtime:1, Total:1, paytime:1, sellertime:1, match_status:1}).exec(function(ordErr, ordRes) {
    if(ordRes) {
      if((ordRes.status == "active" || ordRes.status == "partially") && ordRes.match_status == 0) {
        p2pHlp.matching(userId, ordRes);
      }
      var strData = JSON.stringify(ordRes);
      var parData = JSON.parse(strData);
      parData['buyer_pay'] = ordRes.paytime;
      parData['seller_pay'] = (ordRes.sellertime) ? ordRes.sellertime : "";
      delete parData['_id']; delete parData['user_id']; delete parData['paytime']; delete parData['sellertime'];
      res.json({success:1, result:parData});
    } else {
      res.json({success:0, msg:"Invalid request"});
    }
  });
});

function proofUpload(req, callback) {
  var uploadImg = "";
  if(req.file != null && req.file != undefined && req.file.path != "") {
    cloudinary.uploadImage(req.file.path,function(imgRes) {
      if(imgRes != undefined) {
        uploadImg = imgRes.secure_url;
        callback(uploadImg);
      } else {
        callback(uploadImg);
      }
    });
  } else {
    callback(uploadImg);
  }
}

router.post('/buyerConfirm', upload.single('ref_img'), common.userVerify, (req,res) => {
  let info = req.body;
  let userId = req.userId;
  if(info.order_id == undefined || info.order_id == "" || info.agree == undefined || info.agree == "") {
    return res.json({success:0, msg:"Invalid request"});
  }
  orderDb.findOne({order_id:info.order_id, user_id:userId}, {_id:1, matchid:1, Type:1, Price:1, firstCurrency:1, secondCurrency:1}).exec(function(ordErr, ordRes) {
    if(ordRes) {
      let type = ordRes.Type;
      let matchId = ordRes.matchid;
      let buyId = (type == "buy") ? ordRes._id : matchId;
      let sellId = (type == "sell") ? ordRes._id : matchId;
      if(matchId != undefined) {
        orderDb.findOne({_id:matchId}, {order_id:1}).exec(function(matErr, matRes) {
          if(matRes) {
            escrowDb.findOne({sellorderId:sellId, buyorderId:buyId}, {_id:1, buyerUserId:1, sellerUserId:1, amount:1}).exec(function(escErr, escRes) {
              if(escRes) {
                proofUpload(req, function(uploadImg) {
                  if(uploadImg != null && uploadImg != undefined && uploadImg != "") {
                    escrowDb.updateOne({_id:escRes._id}, {"$set":{proof:uploadImg, buy_status:"paid"}}).exec(function(upErr, upRes) {
                      if(upRes) {
                        let pt = new Date(); pt.setHours( pt.getHours() + 4 );
                        orderDb.updateMany({_id:{$in:[ordRes._id, matchId]}}, {"$set":{ sellertime:pt, pagestatus:"payconfirm" }}).exec(function(upErr1, upRes1) {});
                        // orderDb.updateOne({_id:matchId}, {"$set":{ sellertime:pt, pagestatus:"payconfirm" }}).exec(function(upErr2, upRes2) {});

                        p2pHlp.p2pOrderUpdate(matRes.order_id);
                        var total = parseFloat(escRes.amount) * parseFloat(ordRes.Price);

                        let notObj = {user_id:escRes.buyerUserId, category:"P2P Payment Completed", message:"Your P2P buy order has confirmed payment process for "+escRes.amount.toFixed(8)+" "+ordRes.firstCurrency+" with payment of "+total.toFixed(2)+" "+ordRes.secondCurrency, page:"p2p"};
                        let notObj1 = {user_id:escRes.sellerUserId, category:"P2P Payment Received", message:"Your P2P sell order has confirmed payment process for "+escRes.amount.toFixed(8)+" "+ordRes.firstCurrency+" with payment of "+total.toFixed(2)+" "+ordRes.secondCurrency, page:"p2p"};
                        notify.create(notObj, function(notErr, notRes) {});
                        notify.create(notObj1, function(notErr, notRes) {});

                        sellerMail(escRes.buyerUserId, escRes.sellerUserId, escRes.amount, total, ordRes.firstCurrency, ordRes.secondCurrency);
                        res.json({success:1, msg:"Buyer confirmed payment process"});
                      } else {
                        res.json({success:0, msg:"Failed to update matching order"});
                      }
                    });
                  } else {
                    res.json({success:0, msg:"Failed to upload proof"});
                  }
                });
              } else {
                res.json({success:0, msg:"No matching records found"});
              }
            });
          } else {
            res.json({success:0, msg:"Order not matched"});
          }
        });
      } else {
        res.json({success:0, msg:"Order not matched"});
      }
    } else {
      res.json({success:0, msg:"Invalid request"});
    }
  });
});

router.post('/sellerConfirm', upload.single('ref_img'), common.userVerify, (req,res) => {
  let info = req.body;
  let userId = req.userId;
  let orderAmt = orderPrice = orderTotal = pendingAmt = pendingTotal = matchAmt = matchPrice = matchTotal = pendingMAmt = pendingMTotal = 0;
  if(info.order_id == undefined || info.order_id == "" || info.agree == undefined || info.agree == "") {
    return res.json({success:0, msg:"Invalid request"});
  }
  orderDb.findOne({order_id:info.order_id, user_id:userId}, {_id:1, matchid:1, Type:1, Amount:1, filledAmount:1, Price:1, firstCurrency:1, secondCurrency:1, Total:1, order_id:1, xid:1, prefer_xid:1}).exec(function(ordErr, ordRes) {
    if(ordRes) {
      let type = ordRes.Type;
      let matchId = ordRes.matchid;
      let buyId = (type == "buy") ? ordRes._id : matchId;
      let sellId = (type == "sell") ? ordRes._id : matchId;
      if(matchId != undefined) {
        escrowDb.findOne({sellorderId:sellId, buyorderId:buyId}, {_id:1, amount:1, currency:1}).exec(function(escErr, escRes) {
          if(escRes) {
            orderDb.findOne({_id:matchId}, {user_id:1, matchid:1, Type:1, Amount:1, filledAmount:1, Price:1, firstCurrency:1, secondCurrency:1, Total:1, order_id:1, Type:1, xid:1, prefer_xid:1}).exec(function(matErr, matRes) {
              if(matRes) {
                let matchUser = matRes.user_id;
                let curr = escRes.currency;
                let amt = escRes.amount;
                let price = ordRes.Price;
                let total = parseFloat(amt) * parseFloat(price);
                let tempJson = {
                  sellorderId: sellId, sellerUserId: mongoose.mongo.ObjectId(userId), askAmount: ordRes.Amount, askPrice: ordRes.Price, firstCurrency: ordRes.firstCurrency, secondCurrency: ordRes.secondCurrency, filledAmount: amt, buyorderId: buyId, buyerUserId: matchUser, buy_fee: 0, sell_fee: 0, total: total, pair: ordRes.firstCurrency+'_'+ordRes.secondCurrency, buy_order:matRes.order_id, sell_order:ordRes.order_id
                };
                mapDb.create(tempJson, function(tempErr, tempRes) {
                  if(tempRes) {
                    if(ordRes.filledAmount > 0 ) {
                      orderAmt = ordRes.filledAmount;
                      orderPrice = ordRes.Price;
                      orderTotal = parseFloat(orderAmt) * parseFloat(orderPrice);
                      
                      pendingAmt = ordRes.Amount - ordRes.filledAmount;
                      if(pendingAmt > 0) {
                        pendingTotal = parseFloat(pendingAmt) * parseFloat(orderPrice);
                        ordId = "trok-"+common.lowerString(4)+new Date().getTime()+common.lowerString(4)+'-'+common.lowerString(5)+'-'+common.lowerString(7);
                        var ordObj = { user_id : mongoose.mongo.ObjectId(userId), order_id : ordId, firstCurrency : ordRes.firstCurrency, secondCurrency : ordRes.secondCurrency, pair : ordRes.firstCurrency+'_'+ordRes.secondCurrency, Amount : pendingAmt, Price : orderPrice, Type : ordRes.Type, Total : pendingTotal, status : 'active', pagestatus : 'wait', xid : ordRes.xid,prefer_xid : ordRes.prefer_xid }
                        // orderDb.create(ordObj, function(newErr, newRes) {});
                      }
                    } else {
                      orderAmt = ordRes.Amount;
                      orderPrice = ordRes.Price;
                      orderTotal = parseFloat(orderAmt) * parseFloat(orderPrice);
                    }

                    if(matRes.filledAmount > 0 ) {
                      matchAmt = matRes.filledAmount;
                      matchPrice = matRes.Price;
                      matchTotal = parseFloat(matchAmt) * parseFloat(matchPrice);

                      pendingMAmt = matRes.Amount - matRes.filledAmount;
                      if(pendingMAmt > 0) {
                        pendingMTotal = parseFloat(pendingMAmt) * parseFloat(matchPrice);
                        matchordId = "trok-"+common.lowerString(4)+new Date().getTime()+common.lowerString(4)+'-'+common.lowerString(5)+'-'+common.lowerString(7);
                        var matchordObj = { user_id : matchUser, order_id : matchordId, firstCurrency : matRes.firstCurrency, secondCurrency : matRes.secondCurrency, pair : matRes.firstCurrency+'_'+matRes.secondCurrency, Amount : pendingMAmt, Price : matchPrice, Type : matRes.Type, Total : pendingMTotal, status : 'active', pagestatus : 'wait', xid : matRes.xid,prefer_xid : matRes.prefer_xid }
                        // orderDb.create(matchordObj, function(new1Err, new1Res) {});
                      }
                    } else {
                      matchAmt = matRes.Amount;
                      matchPrice = matRes.Price;
                      matchTotal = parseFloat(matchAmt) * parseFloat(matchPrice);
                    }

                    orderDb.updateOne({_id:ordRes._id}, {"$set":{Amount:orderAmt, Price:orderPrice, Total:orderTotal, confirmtime:new Date(), pagestatus:"completed", status:"completed", confirm_status:1}}).exec(function(upErr, upRes) {
                      orderDb.updateOne({_id:matchId}, {"$set":{Amount:matchAmt, Price:matchPrice, Total:matchTotal, confirmtime:new Date(), pagestatus:"completed", status:"completed", confirm_status:1}}).exec(function(upErr1, upRes1) {
                        //update last price
                        pairDb.updateOne({from_symbol:ordRes.firstCurrency, to_symbol:ordRes.secondCurrency}, {"$set":{last_price:ordRes.Price}}).exec(function(pairErr, pairRes) {});
                        escrowDb.updateOne({_id:escRes._id}, {"$set":{sell_status:"paid"}}).exec(function(upErr2, upRes2) {
                          common.findUserBalance(matchUser, curr, function(fBalance) {
                            fBalance = parseFloat(fBalance);
                            var upBal = fBalance + amt;
                            common.updateUserBalance(matchUser, curr, upBal, function(callRes) {
                              if(callRes) {
                                p2pHlp.p2pOrderUpdate(matRes.order_id);

                                if(ordRes.filledAmount > 0 && pendingAmt > 0) {
                                  orderDb.create(ordObj, function(newErr, newRes) { p2pHlp.matching(newRes.user_id, newRes); });
                                }
                                if(matRes.filledAmount > 0 && pendingMAmt > 0) {
                                  orderDb.create(matchordObj, function(newErr1, newRes1) { p2pHlp.matching(newRes1.user_id, newRes1); });
                                }
                                
                                var msg = "Your P2P "+type+" order has been completed for "+ordRes.Amount.toFixed(8)+" "+ordRes.firstCurrency+" with payment of "+ordRes.Total.toFixed(2)+" "+ordRes.secondCurrency;
                                let notObj = {user_id:matchUser, category:"P2P Order Completed", message:msg, page:"p2p"};
                                let notObj1 = {user_id:userId, category:"P2P Order Completed", message:msg, page:"p2p"};
                                notify.create(notObj, function(notErr, notRes) {});
                                notify.create(notObj1, function(notErr, notRes) {});

                                completedMail(matchUser, userId, ordRes.Amount, ordRes.Total, ordRes.firstCurrency, ordRes.secondCurrency);
                                console.log({"userid":matchUser, "currency":curr, "exist":fBalance, "new":upBal, "id":ordRes._id.toString(), "type":"P2P Order Match", "time":new Date()});
                                res.json({success:1, msg:"Order confirmed"});
                              } else {
                                res.json({success:1, msg:"Failed to update balance"});
                              }
                            });
                          });
                        });
                      });
                    });
                  } else {
                    res.json({success:0, msg:"Failed to update order"});
                  }
                });
              } else {
                res.json({success:0, msg:"Failed to get matching order"});
              }
            });
          } else {
            res.json({success:0, msg:"No matching records found"});
          }
        });
      } else {
        res.json({success:0, msg:"Order not matched"});
      }
    } else {
      res.json({success:0, msg:"Invalid request"});
    }
  });
});

cron.schedule('*/60 * * * * *', () => {
  failedBuyOrders();
  failedSellOrders();
});

async function failedBuyOrders() {
  orderDb.find({paytime:{ $lte:new Date() }, match_status:1, pagestatus:"pay", Type:"buy", status:{$in:['active', 'partially']} }, {_id:1, user_id:1, Amount:1, Type:1, status:1, matchid:1, firstCurrency:1, secondCurrency:1, order_id:1, Price:1}).exec(function(ordErr, ordRes) {
    if(ordRes.length > 0) {
      processBuyOrders(ordRes, 0);
    }
  });
}

function processBuyOrders(ordRess, ind) {
  if(ordRess[ind] != undefined) {
    let ordRes = ordRess[ind];
    let orderId = ordRes._id;
    let userId = ordRes.user_id;
    let first = ordRes.firstCurrency;
    let second = ordRes.secondCurrency;
    let ordId = ordRes.order_id;
    let matchId = ordRes.matchid;
    let amount = ordRes.Amount;
    let type = ordRes.Type;
    let price = ordRes.Price;
    let status = ordRes.status;

    let orderJson = {
      askAmount: amount, askPrice: price, firstCurrency: first, secondCurrency: second, filledAmount: amount, total: 0, buy_fee: 0, sell_fee: 0, cancel_id: userId, pair: first+'_'+second, sellorderId: mongoose.mongo.ObjectId(0), sellerUserId: mongoose.mongo.ObjectId(0), buyorderId: orderId, buyerUserId: userId, cancel_order: "buy", buy_order: ordId
    };
    mapDb.create(orderJson, function(insErr, insRes) {
      if(insRes) {
        orderDb.updateOne({_id:orderId}, {"$set":{status:'cancelled', pagestatus:'cancel', cancel_status:1, updated_at:new Date()}}).exec(function(upErr,upRes) {
          if(upRes) {
            p2pHlp.p2pUserEmit({token:encdec.encryptNew(userId.toString()), from:first, to:second});
            orderDb.findOne({_id: matchId}, {_id:0, user_id:1, Amount:1, status:1, matchid:1, order_id:1, Price:1}).exec(function(ordErr1, ordRes1) {
              let matchUser = ordRes1.user_id;
              if(ordRes1) {
                p2pHlp.checkCancelOrdertemp("sell", matchId, function(fillAmt) {
                  let filled = ordRes1.Amount - parseFloat(fillAmt);
                  let orderJson1 = {
                    askAmount: ordRes1.Amount, askPrice: ordRes1.Price, firstCurrency: first, secondCurrency: second, filledAmount: parseFloat(filled).toFixed(8), total: 0, buy_fee: 0, sell_fee: 0, cancel_id: matchUser, pair: first+'_'+second, sellorderId: matchId, sellerUserId: matchUser, buyorderId: mongoose.mongo.ObjectId(0), buyerUserId: mongoose.mongo.ObjectId(0), cancel_order: "sell", sell_order: ordRes1.order_id
                  };
                  common.findUserBalance(matchUser, first, function(balRes) {
                    var balance = parseFloat(balRes);
                    var upBal = balance + ordRes1.Amount;
                    upBal = parseFloat(upBal).toFixed(8);
                    mapDb.create(orderJson1, function(insErr1, insRes1) {
                      if(insRes1) {
                        orderDb.updateOne({_id:matchId}, {"$set":{status:'cancelled', pagestatus:'cancel', cancel_status:1, updated_at:new Date()}}).exec(function(upErr,upRes) {
                          if(upRes) {
                            common.updateUserBalance(matchUser, first, upBal, function(upRes) {
                              console.log({"userid":matchUser.toString(), "currency":first, "exist":balance, "new":upBal, "id":matchId.toString(), "type":"P2P Order Cancel", "time":new Date()});
                              p2pHlp.p2pPairEmit({userId:matchUser.toString(), from:first, to:second});
                              p2pHlp.p2pOrderUpdate(ordId);
                              p2pHlp.p2pOrderUpdate(ordRes1.order_id);
                              processBuyOrders(ordRess, ind+1);
                            });
                          } else {
                            processBuyOrders(ordRess, ind+1);
                          }
                        })
                      } else {
                        processBuyOrders(ordRess, ind+1);
                      }
                    })
                  });
                });
              } else {
                processBuyOrders(ordRess, ind+1);
              }
            });
          } else {
            processBuyOrders(ordRess, ind+1);
          }
        });
      } else {
        processBuyOrders(ordRess, ind+1);
      }
    });
  }
}

async function failedSellOrders() {
  orderDb.find({ sellertime:{ $lte:new Date() }, match_status:1, pagestatus:"payconfirm", Type:"sell", status:{$in:['active', 'partially']} }, {_id:1, user_id:1, status:1, matchid:1, firstCurrency:1, secondCurrency:1, order_id:1}).exec(function(ordErr, ordRes) {
    if(ordRes.length > 0) {
      processSellOrders(ordRes, 0);
    }
  });
}

function processSellOrders(ordRess, ind) {
  if(ordRess[ind] != undefined) {
    let ordRes = ordRess[ind];
    let first = ordRes.firstCurrency;
    let second = ordRes.secondCurrency;
    let sellId = ordRes._id;
    let sellUser = ordRes.user_id;
    let sellOrd = ordRes.order_id;
    let buyId = ordRes.matchid;
    let type = "sell";
    let sellSts = ordRes.status;
    orderDb.findOne({_id:buyId}, {user_id:1, Amount:1, status:1, order_id:1, Price:1, Total:1, status:1}).exec(function(ordErr1, ordRes1) {
      if(ordRes1) {
        let amount = ordRes1.Amount;
        let price = ordRes1.Price;
        let buyUser = ordRes1.user_id;
        let buyOrd = ordRes1.order_id;
        p2pHlp.checkCancelOrdertemp("buy", buyId, function(fillAmt) {
          var filled = amount - parseFloat(fillAmt);
          filled = parseFloat(filled).toFixed(8);
          escrowDb.findOne({sellorderId:sellId, buyorderId:buyId}, {_id:0, buy_status:1, sell_status:1, proof:1, remarks:1}).exec(function(escErr, escRes) {
            if(escRes) {
              let disJson = { buyorderId:buyId, sellorderId:sellId, buyerUserId:buyUser, sellerUserId:sellUser, buy_status:escRes.buy_status, sell_status:escRes.sell_status, buy_order:buyOrd, sell_order:sellOrd, from_symbol:first, to_symbol:second, pair:first+'_'+second, amount:filled, price:price, proof:escRes.proof, remarks:escRes.remarks };
              orderDb.updateMany({_id:{$in:[sellId, buyId]}}, {"$set":{pagestatus:"dispute"}}).exec(function(upErr1, upRes1) {
                if(upRes1) {
                  disputeDb.create(disJson, function(disErr, disRes) {
                    if(disRes) {
                      p2pHlp.p2pOrderUpdate(buyOrd);
                      p2pHlp.p2pOrderUpdate(sellOrd);

                      var total = filled * price;
                      let notObj = {user_id:buyUser, category:"P2P Order Dispute", message:"Your P2P buy order has been raised as dispute for "+filled.toFixed(8)+" "+first+" with payment of "+total.toFixed(2)+" "+second, page:"p2p"};
                      let notObj1 = {user_id:sellUser, category:"P2P Order Dispute", message:"Your P2P sell order has been raised as dispute for "+filled.toFixed(8)+" "+first+" with payment of "+total.toFixed(2)+" "+second, page:"p2p"};
                      notify.create(notObj, function(notErr, notRes) {});
                      notify.create(notObj1, function(notErr, notRes) {});

                      disputeMail(buyUser, sellUser);   
                      processSellOrders(ordRess, ind+1);
                    } else {
                      processSellOrders(ordRess, ind+1);
                    }
                  })
                } else {
                  processSellOrders(ordRess, ind+1);
                }
              });
            } else {
              processSellOrders(ordRess, ind+1);
            }
          });
        });
      } else {
        processSellOrders(ordRess, ind+1);
      }
    });
  }
}

function disputeMail(buyuserId, selluserId) {
  users.find({ _id:{$in:[mongoose.mongo.ObjectId(buyuserId),mongoose.mongo.ObjectId(selluserId)]}}, {_id: 1, primary_value:1, added_val:1, username:1}).exec(function(userErr, userRes) {
    if (userErr) { return false; }
    if(userRes) {
      let buyUser = userRes.filter(item => item._id.toString() == buyuserId.toString());
      let sellUser = userRes.filter(item => item._id.toString() == selluserId.toString());

      let buySpecialVars = { '###USER###': buyUser[0].username, '###MATCHUSER###': 'you', '###USER1###': sellUser[0].username};
      let buyUsermail = encdec.decryptNew(buyUser[0].primary_value) + encdec.decryptNew(buyUser[0].added_val);
      
      let sellSpecialVars = { '###USER###': sellUser[0].username, '###MATCHUSER###': buyUser[0].username, '###USER1###': 'you'};
      let sellUsermail = encdec.decryptNew(sellUser[0].primary_value) + encdec.decryptNew(sellUser[0].added_val);

      let adminSpecialVars = { '###USER###': 'Admin', '###MATCHUSER###': buyUser[0].username, '###USER1###': sellUser[0].username};
      let adminmail = 'operations@gs20.com';

      mail.sendMail(buyUsermail, 'trade_dispute', buySpecialVars, function(mailRes) { });
      mail.sendMail(sellUsermail, 'trade_dispute', sellSpecialVars, function(mailRes) { });
      mail.sendMail(adminmail, 'trade_dispute', adminSpecialVars, function(mailRes) { });
      return true;
    } else {
      return false;
    }
  })
}

function buyerMail(buyuserId, selluserId, amount, price, from, to, orderId) {
  users.find({ _id:{$in:[mongoose.mongo.ObjectId(buyuserId),mongoose.mongo.ObjectId(selluserId)]}}, {_id: 1, primary_value:1, added_val:1, username:1}).exec(function(userErr, userRes) {
    if (userErr) { return false; }
    if(userRes) {
      let buyUser = userRes.filter(item => item._id.toString() == buyuserId.toString());
      let sellUser = userRes.filter(item => item._id.toString() == selluserId.toString());

      let buySpecialVars = { '###USER###': buyUser[0].username, '###AMT###': amount+' '+from, '###PRICE###': price+' '+to, '###TIME###': '30 mins', '###MATCHUSER###': sellUser[0].username};
      let buyUsermail = encdec.decryptNew(buyUser[0].primary_value) + encdec.decryptNew(buyUser[0].added_val);
      mail.sendMail(buyUsermail, 'payment_reminder', buySpecialVars, function(mailRes) { });
      orderDb.updateOne({_id:orderId}, {"$set":{remain_status:1}}).exec(function(upErr, upRes) {
      });
      return true;
    } else {
      return false;
    }
  })
}

function sellerMail(buyuserId, selluserId, amount, price, from, to) {
  users.find({ _id:{$in:[mongoose.mongo.ObjectId(buyuserId),mongoose.mongo.ObjectId(selluserId)]}}, {_id: 1, primary_value:1, added_val:1, username:1}).exec(function(userErr, userRes) {
    if (userErr) { return false; }
    if(userRes) {
      let buyUser = userRes.filter(item => item._id.toString() == buyuserId.toString());
      let sellUser = userRes.filter(item => item._id.toString() == selluserId.toString());

      let sellSpecialVars = { '###USER###': sellUser[0].username, '###MATCHUSER###': buyUser[0].username, '###AMT###': amount+' '+from, '###PRICE###': price+' '+to};
      let sellUsermail = encdec.decryptNew(sellUser[0].primary_value) + encdec.decryptNew(sellUser[0].added_val);

      mail.sendMail(sellUsermail, 'payment_received', sellSpecialVars, function(mailRes) { });
      return true;
    } else {
      return false;
    }
  })
}

function completedMail(buyuserId, selluserId, amount, price, from, to) {
  users.find({ _id:{$in:[mongoose.mongo.ObjectId(buyuserId),mongoose.mongo.ObjectId(selluserId)]}}, {_id: 1, primary_value:1, added_val:1, username:1}).exec(function(userErr, userRes) {
    if (userErr) { return res.json({success:0, msg:"Please try again later"}); }
    if(userRes) {

      let buyUser = userRes.filter(item => item._id.toString() == buyuserId.toString());
      let sellUser = userRes.filter(item => item._id.toString() == selluserId.toString());

      let buySpecialVars = { '###USER###': buyUser[0].username, '###AMT###': amount+' '+from, '###PRICE###': price+' '+to, '###MATCHUSER###': sellUser[0].username, '###MATCHUSER1###': sellUser[0].username, '###MATCHUSERTYPE###': 'Seller'};
      let buyUsermail = encdec.decryptNew(buyUser[0].primary_value) + encdec.decryptNew(buyUser[0].added_val);

      let sellSpecialVars = { '###USER###': sellUser[0].username, '###AMT###': amount+' '+from, '###PRICE###': price+' '+to, '###MATCHUSER###': buyUser[0].username, '###MATCHUSER1###': buyUser[0].username, '###MATCHUSERTYPE###': 'Buyer'};
      let sellUsermail = encdec.decryptNew(sellUser[0].primary_value) + encdec.decryptNew(sellUser[0].added_val);

      mail.sendMail(buyUsermail, 'order_completed', buySpecialVars, function(mailRes) { });
      mail.sendMail(sellUsermail, 'order_completed', sellSpecialVars, function(mailRes) { });
      return true;
    } else {
      return false;
    }
  })
}

router.get('/openHistory', common.userVerify, (req, res) => {
  let userId = req.userId;
  orderDb.find({ user_id: mongoose.mongo.ObjectId(userId), status: { $in:['active', 'partially']} }, {_id:0, Price:1, Amount:1, pair:1, Type:1, order_id:1, created_at:1}).sort({_id: -1}).limit(10).exec(function(err, results) {
    p2pHlp.formatOpen(userId, results, (myRes) => {
      res.json({success:1, msg:myRes});
    })
  });
});

router.get('/tradeHistory', common.userVerify, (req, res) => {
  let userId = req.userId;
  mapDb.find({ $or: [{buyerUserId: mongoose.mongo.ObjectId(userId)}, {sellerUserId: mongoose.mongo.ObjectId(userId)}] }, {pair:1, buyerUserId:1, askPrice:1, filledAmount:1, cancel_id:1, created_at:1, buy_order:1, sell_order:1}).sort({created_at: -1}).limit(10).exec(function(err, results) {
    p2pHlp.formatMyTrade(userId, results, (myRes) => {
      res.json({success:1, msg:myRes});
    })
  });
});

cron.schedule('* * * * *', () => {
  buyerReminder();
});

async function buyerReminder() {
  orderDb.find({paytime:{ $gte:new Date() }, match_status:1, remain_status:0, pagestatus:"pay", Type:"buy", status:{$in:['active', 'partially']} }, {_id:1, user_id:1, Amount:1, matchid:1, firstCurrency:1, secondCurrency:1, Total:1, paytime:1}).exec(function(ordRes, ordRes) {
    if(ordRes.length > 0) {
      buyOrderReminder(ordRes, 0);
    }
  });
}

function buyOrderReminder(ordRess, ind) {
  if(ordRess[ind] != undefined) {
    let buyordRes = ordRess[ind];
    orderDb.findOne({_id: mongoose.mongo.ObjectId(buyordRes.matchid)}, {user_id:1}).exec(function(sellordErr, sellordRes) {
      if(sellordRes) {
        const today = new Date();
        const endDate = new Date(buyordRes.paytime.setDate(buyordRes.paytime.getDate() + 7));
        const minutes = parseInt(Math.abs(endDate.getTime() - today.getTime()) / (1000 * 60) % 60);
        if(minutes == 30) {
          // buyerMail(buyordRes.user_id, sellordRes.user_id, buyordRes.Amount, buyordRes.Total, buyordRes.firstCurrency, buyordRes.secondCurrency, buyordRes._id);
          buyOrderReminder(ordRess, ind+1);
        }
      }
    });
  }
}

module.exports = router;