let jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
var async = require('async');
const cron = require('node-cron');

//schemas
let users = require('../model/users');
let wallet = require('../model/userWallet');
let currency = require('../model/currency');
var cloudinary = require('./cloudinary');
var endecrypt = require('./newendecryption');
let pairDB = require('../model/pairs');
var siteSettings = require('../model/siteSettings');

var socket = 0;
exports.SocketInit = function (socketIO) {
  socket = socketIO;
}

var client = [];
let authKey = 'GAHEuLbsoAzXwfMQLZJopWGW';

exports.singleUploadcheck = function (req,callback) {
  var uploadImg = "";
  if(typeof req.file != 'undefined' && typeof req.file != undefined && req.file.path != "") {
    cloudinary.uploadImage(req.file.path,function(imgRes){
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

exports.generateRandomNumber = function(){
  let text = "";
  let possible = "0123456789";
  for (let i = 0; i < 7; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

exports.randomString = function(len){
  let text = "";
  let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < len; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

exports.getRemarks = function() {
  let text = "";
  let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 5; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

exports.lowerString = function(len) {
  let text = "";
  let possible = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < len; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

exports.updateUserBalance = function(userId, curr, amount, callback){
  wallet.updateOne({user_id:mongoose.mongo.ObjectId(userId), "wallet.currency":curr},{"$set":{"wallet.$.amount": +parseFloat(amount).toFixed(8)}}, {multi:true}).exec(function(balErr,balRes){
    if(balRes){
      callback(balRes)
    } else {
      callback(false)
    }
  });
}

exports.findUserBalance = (userId, curr, callback) => {
  wallet.findOne({user_id:mongoose.mongo.ObjectId(userId)}, {wallet:{$elemMatch:{currency:curr}}}).exec(function(err,resData){
    if(resData) {
      if(resData.wallet.length > 0){
        let amount = resData.wallet[0].amount;
        callback(amount)
      } else {
        callback(false)
      }
    } else {
      callback(false)
    }
  });
}

exports.multiBalance = (userId, curr1, curr2, callback) => {
  wallet.findOne({user_id:mongoose.mongo.ObjectId(userId)}, {wallet:1, _id:0}).exec(function(err,resData){
    if(resData){
      var newBal = []; var i = 1; var len = resData.wallet.length;
      resData.wallet.forEach((val) => {
        if(val.currency == curr1 || val.currency == curr2) {
          newBal[val.currency] = val.amount;
          if(newBal[curr1] != undefined && newBal[curr2] != undefined) {
            callback(newBal); return;
          }
        }
        if(i == len) {
          if(newBal[curr1] == undefined) { newBal[curr1] = 0; }
          if(newBal[curr2] == undefined) { newBal[curr2] = 0; }
          callback(newBal);
        }
        i = i + 1;
      });
    } else {
      callback(false)
    }
  });
}

exports.generateRandomUser = function(){
  let text = "";
  let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 15; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

exports.activateWallet = (data, wal, callback) => {
  var i = 1; var len = data.length;
  data.forEach((val) => {
    var curr = val.symbol;
    wal.wallet.push({"currency":curr, "amount":0});
    if(i == len) { callback(wal); }
    i = i + 1;
  });
}

exports.createPayload = (key) => {
  let payload = { secret:key, WigrNvGUomqlDeK:"SJdzhSqtAxGQhVRcafapjAvSKqwrEeNf" }
  let token = jwt.sign(payload, authKey, {expiresIn:180 * 60});
  return token;    
}

exports.logout = (token) => {
  var ceck = jwt.decode(token);
}

exports.getUserId = (token) => {
  try {
    let payload = jwt.verify(token, authKey);
    if(payload) {
      return payload.secret;
    }
    return false;
  } catch (e) {
    return false;
  }
}

var orgArrVal = ["http://localhost:1201", "http://localhost:4200", "https://gs20.exchange", "https://oeyfnvpdjh.gs20.exchange", "https://kspedfhabc.gs20.exchange"];

exports.tokenMiddleware = (req,res,next) => {
  let origin = req.headers['origin'];
  let index = orgArrVal.indexOf(origin);
  if(index > -1) {
    let token = req.headers['x-access-token'] || req.headers['authorization'];
    if(!token){
      return res.json({success:401, msg:"Unauthorized request"});
    }
    token = token.split(' ')[1];
    if(token === 'null'){
      return res.json({success:401, msg:"Unauthorized request"});
    } else {
      try {
        let payload = jwt.verify(token, authKey)
        if(!payload){
          return res.json({success:401, msg:"Unauthorized request"});
        }
        if(payload.WigrNvGUomqlDeK == "SJdzhSqtAxGQhVRcafapjAvSKqwrEeNf") {
          req.userId = payload.secret;
          next();
        } else {
          return res.json({success:401, msg:"Unauthorized request"});
        }
      } catch(e) {
        return res.json({success:401, msg:"Unauthorized request"});
      }
    }
  } else {
    return res.json({success:401, msg:"Unauthorized Request"});
  }
}

exports.userVerify = (req,res,next) => {
  let origin = req.headers['origin'];
  let index = orgArrVal.indexOf(origin);
  if(index > -1) {
    let token = req.headers['x-access-token'] || req.headers['authorization'];
    if(!token){
      return res.json({success:401, msg:"Unauthorized"});
    }
    token = token.split(' ')[1];
    if(token === 'null'){
      return res.json({success:401, msg:"Unauthorized"});
    } else {
      try {
        let payload = jwt.verify(token, authKey)
        if(!payload){
          return res.json({success:401, msg:"Unauthorized"});
        }
        if(payload.WigrNvGUomqlDeK == "SJdzhSqtAxGQhVRcafapjAvSKqwrEeNf") {
          req.userId = payload.secret;
          next();
        } else {
          return res.json({success:401, msg:"Unauthorized request"});
        }
      } catch(e) {
        return res.json({success:401, msg:"Unauthorized request"});
      }
    }
  } else {
    return res.json({success:401, msg:"Unauthorized Request"});
  }
}

exports.apiMiddleware = (req,res,next) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
  const [api, secret] = Buffer.from(b64auth, 'base64').toString().split(':')
  if(api != "" && api != undefined && secret != "" && secret != undefined) {
    users.findOne({api_key:api, secret_key:secret}, {_id:1}).exec(function (err, usrData) {
      if(usrData) {
        req.userId = usrData._id.toString();
        next();
      } else {
        return res.json({success:0, error:"Invalid API Keys"});
      }
    });
  } else {
    return res.json({success:401, error:"Unauthorized request"});
  }
}

exports.checkUserId = (req, res, next) => {
  let origin = req.headers['origin'];
  let index = orgArrVal.indexOf(origin);
  if(index > -1) {
    let token = req.headers['x-access-token'] || req.headers['authorization'];
    if(!token){
      req.userId = 0;
    } else {
      token = token.split(' ')[1];
      if(token === 'null'){
        req.userId = 0;
      } else {
        try {
          let payload = jwt.verify(token, authKey);
          if(!payload) {
            req.userId = 0;
          } else {
            req.userId = (payload.WigrNvGUomqlDeK == "SJdzhSqtAxGQhVRcafapjAvSKqwrEeNf") ? payload.secret : 0;
          }
        } catch (e) {
          req.userId = 0;
        }
      }
    }
  } else {
    req.userId = 0;
  }
  next();
}

exports.originMiddle = (req, res, next) => {
  let origin = req.headers['origin'];
  let index = orgArrVal.indexOf(origin);
  if(index > -1) {
    next();
  } else {
    return res.json({success:401, msg:"Unauthorized Request"});
  }
}

exports.checkRefer = function(refId, callback) {
  if(refId != "") {
    users.find({refer_id:refId}).countDocuments().exec(function(err,res) {
      if(res) {
        callback(1);
      } else {
        callback(0);
      }
    })
  } else {
    callback(1);
  }
}

referId = exports.referId = function(callback) {
  let text = "";
  let possible = "123456789";
  for (let i = 0; i < 10; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  users.find({refer_id:text}).countDocuments().exec(function(err,res) {
    if(res) {
      return referId(callback);
    } else {
      return callback(text);
    }
  })
}

/* --------------- Trade part ---------------- */

let checkOrderTemp = exports.checkOrderTemp = function (status, type, orderId, callback) {
  if(status == "partially") {
    let mapDb = mongoose.model('ordertemp');
    if (type == 'Buy') {
      var matchCase = { buyorderId: orderId };
    } else {
      var matchCase = { sellorderId: orderId };
    }
    mapDb.aggregate([
      { $match: matchCase },
      { $group: { _id: null, sum: { $sum: "$filledAmount" } } },
      { $project: { _id: 0, sum: 1 } }
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

exports.checkExistOrder = (fir, sec, type, userId, order, price, callback) => {
  callback({'status':1});
}

exports.checkActiveOrder = (fir, sec, type, userId, order, callback) => {
  callback(true);
}

function formatBuy(buy, callback) {
  if(buy.length > 0) {
    var buys = [];
    var buyArr; var bSum = 0; var i = 1; var len = buy.length;
    buy.forEach((val) => {
      var type = "Buy";
      var price = val.Price;
      var amount = val.Amount;
      checkOrderTemp(val.status, type, mongoose.mongo.ObjectId(val.oid), function(fillAmt) {
        var filled = parseFloat(amount) - parseFloat(fillAmt);
        bSum = bSum + filled;
        buyArr = { 'amount':parseFloat(filled).toFixed(8), 'price':parseFloat(price).toFixed(8), 'sum':parseFloat(bSum).toFixed(8) };
        buys.push(buyArr);
        if(i == len) { callback(buys); }
        i = i + 1;
      })
    });
  } else {
    callback([]);
  }
}

function formatSell(sell, callback) {
  if(sell.length > 0) {
    var sells = [];
    var sellArr; var sSum = 0; var i = 1; var len = sell.length;
    sell.forEach((sval) => {
      var type = "Sell";
      var price = sval.Price;
      var amount = sval.Amount;
      checkOrderTemp(sval.status, type, mongoose.mongo.ObjectId(sval.oid), function(fillAmt) {
        var filled = parseFloat(amount) - parseFloat(fillAmt);
        sSum = sSum + filled;
        sellArr = { 'amount':parseFloat(filled).toFixed(8), 'price':parseFloat(price).toFixed(8), 'sum':parseFloat(sSum).toFixed(8) };
        sells.push(sellArr);
        if(i == len) { callback(sells); }
        i = i + 1;
      })
    });
  } else {
    callback([]);
  }
}

function formatTrade(trade, callback) {
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

exports.formatOrderHist = function(open, callback) {
  if(open.length > 0) {
    var opens = [];
    var openArr; var i = 1; var len = open.length;
    open.forEach((val) => {
      var type = val.Type.charAt(0).toUpperCase()+val.Type.slice(1);
      var price = val.Price;
      var amount = val.Amount;
      var feePer = val.fee_per;
      var ctime = val.updated_at;
      var status = val.status;
      checkOrderTemp(status, type, val._id, function(filled) {
        var filledAmt = parseFloat(amount) - parseFloat(filled);
        var total = filledAmt * price;
        var feeAmt = total * feePer / 100;
        total = (type == "Buy") ? total + feeAmt : total - feeAmt;
        openArr = {'updated_at':ctime, 'Type':type, 'Amount':filledAmt.toFixed(8), 'Price':price.toFixed(8), 'Total':total.toFixed(8), 'pairs':val.from +'/'+ val.to, 'username':val.username, 'status':status};
        opens.push(openArr);
        if(i == len) { callback(opens); }
        i = i + 1;
      })
    });
  } else {
    callback([]);
  }
}

exports.formatOpen = function(from, to, userId, open, callback) {
  if(open.length > 0) {
    var opens = [];
    var openArr; var i = 1; var len = open.length;
    open.forEach((val) => {
      var type = val.Type.charAt(0).toUpperCase()+val.Type.slice(1);
      var orderId = endecrypt.encryptNew(val._id.toString());
      var price = val.Price;
      var amount = val.Amount;
      var feePer = val.fee_per;
      var ctime = val.created_at;
      var status = val.status;
      checkOrderTemp(status, type, val._id, function(filled) {
        var filledAmt = parseFloat(amount) - parseFloat(filled);
        var total = filledAmt * price;
        var feeAmt = total * feePer / 100;
        total = (type == "Buy") ? total + feeAmt : total - feeAmt;
        var clsName = (type == "Buy") ? "text-success":"text-danger";
        openArr = {'ctime':ctime, 'type':type, 'amount':filledAmt.toFixed(8), 'price':price.toFixed(8), 'total':total.toFixed(8), 'cls':clsName, 'token':orderId, 'status':status};
        opens.push(openArr);
        if(i == len) { callback(opens); }
        i = i + 1;
      })
    });
  } else {
    callback([]);
  }
}

exports.formatStop = function(from, to, userId, stop, callback) {
  if(stop.length > 0) {
    var stops = [];
    var stopArr; var i = 1; var len = stop.length;
    stop.forEach((val) => {
      var type = val.Type.charAt(0).toUpperCase()+val.Type.slice(1);
      var orderId = endecrypt.encryptNew(val._id.toString());
      var price = val.Price;
      var amount = val.Amount;
      var feePer = val.fee_per;
      var ctime = val.created_at;
      var total = amount * price;
      var feeAmt = total * feePer / 100;
      total = (type == "Buy") ? total + feeAmt : total - feeAmt;
      var clsName = (type == "Buy") ? "text-success" : "text-danger";
      stopArr = {'ctime':ctime, 'type':type, 'amount':amount.toFixed(8), 'price':price.toFixed(8), 'total':total.toFixed(8), 'cls':clsName, 'token':orderId};
      stops.push(stopArr);
      if(i == len) { callback(stops); }
      i = i + 1;
    });
  } else {
    callback([]);
  }
}

exports.formatUsers = function(user, callback) {
  if(user.length > 0) {
    var users = [];
    var userArr; var i = 1; var len = user.length;
    user.forEach((val) => {
      var email = endecrypt.decryptNew(val.primary_value)+endecrypt.decryptNew(val.added_val);
      userArr = {'username':val.username, 'email':email};
      users.push(userArr);
      if(i == len) { callback(JSON.stringify(users)); }
      i = i + 1;
    });
  } else {
    callback([]);
  }
}

exports.formatMyTrade = function(from, to, userId, trade, callback) {
  if(trade.length > 0) {
    hists = [];
    var histArr; var i = 1; var len = trade.length;
    trade.forEach((val) => {
      var sellUser = val.sellerUserId.toString();
      var buyUser = val.buyerUserId.toString();
      var cancelId = val.cancel_id;
      var amount = val.filledAmount;
      var price = val.askPrice;
      var ctime = val.created_at;
      var type = (buyUser == userId) ? "Buy" : "Sell";
      var total = amount * price;
      var status = (cancelId != null) ? "Cancelled" : "Filled";
      var clsName = (status == "Filled") ? "text-success" : "text-danger";
      var tclsName = (type == "Buy") ? "text-success":"text-danger";
      var fees = (type == "Buy") ? val.buy_fee : val.sell_fee;
      histArr = {'ctime':ctime, 'type':type, 'amount':amount.toFixed(8), 'price':price.toFixed(8), 'total':total.toFixed(8), 'fees':fees, 'status':status, 'scls':clsName, 'tcls':tclsName};
      hists.push(histArr);
      if(i == len) { callback(hists); }
      i = i + 1;
    })
  } else {
    callback([]);
  }
}

exports.tradePairUnset = function(pair, callback){
  if(typeof client['Trade'] != 'undefined' && typeof client['Trade'] != undefined ) {
    var reply = client['Trade'];
    var allPairs = JSON.parse(reply);
    if(pair!='' && typeof allPairs[pair] != 'undefined' && allPairs[pair] != undefined) {
      delete allPairs[pair];
      var response = JSON.stringify(allPairs);
      client['Trade'] = response;
      callback('success');
    } else {
      callback('success');
    }
  } else {
    client['Trade'] = JSON.stringify({});
    callback('success'); 
  }
}

exports.resetPairs = function(pair, callback) {
  if(client['Pairs'] != undefined) {
    pairDB.find({status:1}, {_id:0, from_symbol:1, to_symbol:1, change_per:1, last_price:1, prc_clr:1, volume:1, amt_volume:1, high:1, low:1}).exec(function (err, resData) {
      if(resData.length > 0) {
        var pairRes = {};
        for (var i = 0; i < resData.length; i++) {
          var from = resData[i].from_symbol;
          var to = resData[i].to_symbol;
          var clr = (resData[i].prc_clr == 1) ? "text-success" : ((resData[i].prc_clr == 2) ? "text-danger" :"");
          pairRes[from+'_'+to] = { change:resData[i].change_per, from:from, to:to, pair:from+'_'+to, price:parseFloat(resData[i].last_price).toFixed(8), clr:clr, volume:resData[i].volume, amt_volume:resData[i].amt_volume, high:resData[i].high, low:resData[i].low };
        }
        var response = JSON.stringify(pairRes);
        delete client['Pairs'];
        client['Pairs'] = response;
      }
    });
  }
  if(typeof client['Trade'] != 'undefined' && typeof client['Trade'] != undefined ) {
    var reply = client['Trade'];
    var allPairs = JSON.parse(reply);
    if(pair!='' && typeof allPairs[pair] != 'undefined' && allPairs[pair] != undefined) {
      delete allPairs[pair];
      var response = JSON.stringify(allPairs);
      client['Trade'] = response;
      callback('success');
    } else {
      callback('success');
    }
  } else {
    client['Trade'] = JSON.stringify({});
    callback('success'); 
  }
}

let tradeToarray = exports.tradeConfig = function(value, callback){
  if(typeof client['Trade'] == 'undefined' || client['Trade'] == undefined || ((value!='' && !(JSON.parse(client['Trade'])[value])) || value == '')) {
    var getTrades = (!client['Trade']) ? {} : JSON.parse(client['Trade']);
    var where = {};
    if(value != '') {
      var pairs = value.split('_');
      if(pairs.length == 2) {
        where = { "from_symbol":pairs[0], "to_symbol":pairs[1], "status":1 };
      }
    }
    pairDB.find(where, {_id:0, from_symbol:1, to_symbol:1, trade_fee:1, last_price:1, min_amt:1, price_range:1, change_per:1, volume:1, high:1, low:1, prc_clr:1, amt_decimal:1, decimal:1, liquidity:1, amt_volume:1}).exec(function (err, res) {
      if(res) {
        var length = res.length;
        var loaded = 0;
        if(length > 0) {
          for (var i = 0; i < length; i++) {
            trade(res[i], i, (tradeHist) => {
              var increment = tradeHist.autoInc;
              var fromCurrency = res[increment].from_symbol;
              var toCurrency = res[increment].to_symbol;
              var stringifyData = JSON.stringify(res[increment]);
              var inputData;
              inputData = JSON.parse(stringifyData);
              inputData['pair'] = fromCurrency+'_'+toCurrency;
              inputData['buyOrders'] = tradeHist.buys;
              inputData['sellOrders'] = tradeHist.sells;
              inputData['tradeHistory'] = tradeHist.tradeHists;
              getTrades[fromCurrency+'_'+toCurrency] = inputData
              loaded = loaded + 1;
              if(loaded == length) {
                var response = JSON.stringify(getTrades);
                client['Trade'] = response;
                if(value != '') {
                  sendToUsers(getTrades, value);
                  callback(JSON.parse(response)[value]);
                } else {
                  objToarray(JSON.parse(response),(tradeDetails) => {
                    callback(tradeDetails);
                  });
                }
              }
            });
          }
        } else {
          callback([]);
        }
      } else {
        callback([]);
      }
    });
  } else {
    var reply = client['Trade'];
    if(value != '') {
      callback(JSON.parse(reply)[value]);
      sendToUsers(JSON.parse(reply), value);
    } else {
      objToarray(JSON.parse(reply),(tradeDetails) => {
        callback(tradeDetails);
      });
    }
  }
}

let pairs = exports.pairsConfig = function(callback){
  if(typeof client['Pairs'] == 'undefined' || client['Pairs'] == undefined ) {
    pairDB.find({status:1}, {_id:0, from_symbol:1, to_symbol:1, change_per:1, last_price:1, prc_clr:1, volume:1, amt_volume:1, high:1, low:1}).exec(function (err, resData) {
      if(resData.length > 0) {
        var pairRes = {};
        for (var i = 0; i < resData.length; i++) {
          var from = resData[i].from_symbol;
          var to = resData[i].to_symbol;
          var clr = (resData[i].prc_clr == 1) ? "text-success" : ((resData[i].prc_clr == 2) ? "text-danger" :"");
          pairRes[from+'_'+to] = { change:resData[i].change_per, from:from, to:to, pair:from+'_'+to, price:parseFloat(resData[i].last_price).toFixed(8), clr:clr, volume:resData[i].volume, amt_volume:resData[i].amt_volume, high:resData[i].high, low:resData[i].low };
        }
        var response = JSON.stringify(pairRes);
        client['Pairs'] = response;
        callback(pairRes);
      } else {
        callback([]);
      }
    });
  } else {
    var reply = client['Pairs'];
    callback(JSON.parse(reply));
  }
}

let trade = exports.getPairInfo = function (pair, inc, callback) {
  let orderDB = mongoose.model('coin_order');
  let mapDb = mongoose.model('ordertemp');
  let liqPairs = ["BTC_USDT", "ETH_USDT", "BUSD_USDT", "XRP_USDT", "TRX_USDT", "BTC_EUR", "ETH_EUR", "XRP_EUR", "TRX_EUR"];
  var response = {};
  response.pair = pair.from_symbol+'_'+pair.to_symbol;
  var selPair = pair.from_symbol+'_'+pair.to_symbol;
  let index = liqPairs.indexOf(selPair);
  if(index > -1) {
    response.autoInc = inc;
    response.buys = [];
    response.sells = [];
    response.tradeHists = [];
    callback(response);
  } else {
    var buyWhere = { firstCurrency:pair.from_symbol, secondCurrency:pair.to_symbol, Type:'buy', site:"gs20", status: { $in:['active', 'partially']} };
    var sellWhere = { firstCurrency:pair.from_symbol, secondCurrency:pair.to_symbol, Type:'sell', site:"gs20", status: { $in:['active', 'partially']} };
    async.parallel({
      BuyOrder : function(cb) {
        orderDB.aggregate([
          { $match : buyWhere },
          { $project : { oid:'$_id', Price:'$Price', status:'$status', Amount:{$sum:'$Amount'} } },
          { $group : { '_id':'$Price', 'Amount':{$sum:'$Amount'}, 'Price':{ $first:'$Price' }, 'status':{ $first:'$status' }, 'oid':{ $first:'$_id' } } },
          { $sort : { Price:-1, _id:-1 } },
          { $limit : 50 }
          ]).exec(cb)
      },
      SellOrder : function (cb) {
        orderDB.aggregate([
          { $match : sellWhere },
          { $project : { oid:'$_id', Price:'$Price', status:'$status', Amount:{$sum:'$Amount'} } },
          { $group : { '_id':'$Price', 'Amount':{$sum:'$Amount'}, 'Price':{ $first:'$Price' }, 'status':{ $first:'$status' }, 'oid':{ $first:'$_id' } } },
          { $sort : { Price:1, _id:1 } },
          { $limit : 50 }
          ]).exec(cb)
      },
      TradeHistory : function(cb) {
        mapDb.find({firstCurrency:pair.from_symbol, secondCurrency:pair.to_symbol, cancel_id:null}, {filledAmount:1, _id:0, askPrice:1, created_at:1, sellorderId:1, buyorderId:1}).sort({created_at:-1}).limit(50).exec(cb)
      }
    },function(err, results){
      response.autoInc = inc;
      if(results) {
        var buy = results.BuyOrder;
        var sell = results.SellOrder;
        var trade = results.TradeHistory;
        formatBuy(buy, function(buyRes) {
          formatSell(sell, function(sellRes) {
            formatTrade(trade, function(tradeRes) {
              response.buys = buyRes;
              response.sells = sellRes;
              response.tradeHists = tradeRes;
              callback(response);
            })
          })
        })
      } else {
        response.buys = [];
        response.sells = [];
        response.tradeHists = [];
        callback(response);
      }
    })
  }
}

let objToarray = exports.ObjectToArray = function (obj,callback) {
  pairs((pairsDetail) => {
    var result = [];
    var j=0;
    for (var i = 0; i < pairsDetail.length; i++) {
      if(typeof obj[pairsDetail[i].pair] != 'undefined' && obj[pairsDetail[i].pair] != undefined) {
        result[j] = obj[pairsDetail[i].pair];
        j++;
      } else {
        tradeToarray(pairsDetail[i].pair,(pairsDetail) => {});
      }
    }
    callback(result);
  });
}

let newPairs = exports.getNewPairs = function (cb) {
  pairDB.find({status:1}, {_id:0, from_symbol:1, to_symbol:1, change_per:1, last_price:1, prc_clr:1, volume:1, amt_volume:1, high:1, low:1}).exec(function (err, resData) {
    if(resData.length > 0) {
      var pairRes = {};
      for (var i = 0; i < resData.length; i++) {
        var from = resData[i].from_symbol;
        var to = resData[i].to_symbol;
        var clr = (resData[i].prc_clr == 1) ? "text-success" : ((resData[i].prc_clr == 2) ? "text-danger" :"");
        pairRes[from+'_'+to] = { change:resData[i].change_per, from:from, to:to, pair:from+'_'+to, price:parseFloat(resData[i].last_price).toFixed(8), clr:clr, volume:resData[i].volume, amt_volume:resData[i].amt_volume, high:resData[i].high, low:resData[i].low };
        if(typeof client['Trade'] != 'undefined' && typeof client['Trade'] != undefined ) {
          var reply = client['Trade'];
          var allPairs = JSON.parse(reply);
          if(allPairs[from+'_'+to] != undefined) {
            allPairs[from+'_'+to]['change_per'] = resData[i].change_per;
            allPairs[from+'_'+to]['last_price'] = resData[i].last_price;
            allPairs[from+'_'+to]['volume'] = resData[i].volume;
            allPairs[from+'_'+to]['amt_volume'] = resData[i].amt_volume;
            allPairs[from+'_'+to]['high'] = resData[i].high;
            allPairs[from+'_'+to]['low'] = resData[i].low;
            allPairs[from+'_'+to]['prc_clr'] = resData[i].prc_clr;
            var response = JSON.stringify(allPairs);
            client['Trade'] = response;
          }
        }
      }
      delete client['Pairs'];
      var response = JSON.stringify(pairRes);
      client['Pairs'] = response;
      cb(pairRes);
    }
  });
}

exports.getPairs = function (cb) {
  var pairarr = {}; var valarr = []; var j = 0;
  newPairs((pairData) => {
    var pairs = Object.keys(pairData);
    if(pairs.length > 0) {
      for (var i = 0; i < pairs.length; i++) {
        if(!pairarr[pairData[pairs[i]].to]) {
          pairarr[pairData[pairs[i]].to] =[];
        }
        pairarr[pairData[pairs[i]].to].push(pairData[pairs[i]]);
      }
      Object.keys(pairarr).map(function(key) {
        valarr[j] = {'currency':key, 'pairs':pairarr[key]};
        j++;
      });
      cb(valarr);
    }
  });
}

let sendToUsers = exports.sendToUsers = function (obj, pair) {
  let buys = (obj[pair]['buyOrders'] == undefined) ? [] : obj[pair]['buyOrders'];
  let sells = (obj[pair]['sellOrders'] == undefined) ? [] : obj[pair]['sellOrders'];
  let trades = (obj[pair]['tradeHistory'] == undefined) ? [] : obj[pair]['tradeHistory'];
  socket.sockets.emit('emitPairsResponse', { 'buys':buys, 'sells':sells, 'hists':trades, 'pair':pair });
}

exports.updatePairInfo = function(from, to, lprice, callback) {
  pairs((pairData) => {
    var selPair = from+'_'+to;
    var pairs = Object.keys(pairData);
    if(pairs.length > 0) {
      let mapDb = mongoose.model('ordertemp');
      mapDb.aggregate([
        { $match: { firstCurrency:from, secondCurrency:to, cancel_id:null, datetime:{ $gte:new Date(new Date().setDate(new Date().getDate() - 1)) } } },
        { $group: { _id: null, amt_volume:{ $sum:"$filledAmount" }, volume:{ $sum:"$total" }, price: { $first:"$askPrice" }, low: { $min:"$askPrice" }, high: { $max:"$askPrice" } } },
        { $sort: { datetime:1 } }
      ]).exec(function(trdErr, trdRes) {
        if(trdRes) {
          var pairRes = {};
          lprice = parseFloat(lprice).toFixed(8);
          var yesterPrice = trdRes[0].price;
          var dailyChange = lprice - yesterPrice;
          var per = (dailyChange / yesterPrice) * 100;
          per = parseFloat(per).toFixed(2);
          var clr = (lprice > yesterPrice) ? 1 : ((lprice == yesterPrice) ? 0 : 2);
          var prcClr = (clr == 1) ? "text-success" : ((clr == 2) ? "text-danger" : "");
          var volume = trdRes[0].volume.toFixed(8);
          var amt_volume = trdRes[0].amt_volume.toFixed(8);
          var high = trdRes[0].high.toFixed(8);
          var low = trdRes[0].low.toFixed(8);
          pairDB.updateOne({from_symbol:from, to_symbol:to}, {$set:{ change_per:per, last_price:lprice, amt_volume:amt_volume, volume:volume, high:high, low:low, prc_clr:clr }}, {multi:true}).exec(function(upErr,upRes){
            if(upRes){
              if(pairData[selPair] && pairData[selPair] != undefined) {
                pairData[selPair].price = lprice;
                pairData[selPair].clr = prcClr;
                pairData[selPair].change = per;
                pairData[selPair].volume = volume;
                pairData[selPair].amt_volume = amt_volume;
                pairData[selPair].high = high;
                pairData[selPair].low = low;
                pairData[selPair].from = from;
                pairData[selPair].to = to;
                pairData[selPair].pair = selPair;
                var response = JSON.stringify(pairData);
                delete client['Pairs'];
                client['Pairs'] = response;
                pairRes[selPair] = { change:per, from:from, to:to, pair:selPair, price:lprice, clr:prcClr, amt_volume:amt_volume, volume:volume, high:high, low:low };
                socket.sockets.emit('upPairInfo', {'pairinfo':pairRes});
              }
              callback({change:per, price:lprice, volume:volume, amt_volume:amt_volume, high:high, low:low, clr:prcClr});
            } else {
              callback(false)
            }
          });
        } else {
          callback(false);
        }
      })
    }
  })
}

exports.getWalletBalance = function(currency, callback) {
  callback(0);
}

function getBalance(data, callback) {
  callback(0);
}

exports.addressValidation = function(curr, addr, callback) { 
  callback(1)
}

exports.stopLiquidity = function(data, callback) {
  callback(0);
}

let liqClient = {
  "binance":{"BTC_USDT":{}, "ETH_USDT":{}, "XRP_USDT":{}, "TRX_USDT":{}, "BTC_EUR":{}, "ETH_EUR":{}}
};
exports.allPairInfo = function (resArr, liq, liqSoc) {
  let i = 1; let len = resArr.length;
  let pairData = liqClient[liq];
  resArr.forEach((resp) => {
    let selPair = resp.from+'_'+resp.to;
    let clr = (resp.clr == 1) ? "text-success" : ((resp.clr == 2) ? "text-danger" :"");
    pairData[selPair].from = resp.from;
    pairData[selPair].to = resp.to;
    pairData[selPair].pair = selPair;
    pairData[selPair].change = resp.change;
    pairData[selPair].price = resp.price;
    pairData[selPair].clr = clr;
    pairData[selPair].volume = resp.volume;
    pairData[selPair].amt_volume = resp.amt_volume;
    pairData[selPair].high = resp.high;
    pairData[selPair].low = resp.low;
    if(i == len) {
      liqSoc.sockets.emit(liq + '_allPairInfo', { 'pairinfo':pairData });
    }
    i = i + 1;
  });
}

exports.formatTrdDate = function(time) {
  let obj = new Date(time);
  let ts = obj.getTime() / 1000;
  return parseInt(ts);
}

exports.checkBalUpdates = function(userId, curr, fromBal, toBal, action) {
  let balObj = { "user_id":mongoose.mongo.ObjectId(userId), "currency":curr, "old_bal":parseFloat(fromBal), "new_bal":parseFloat(toBal), "action":action };
  balUpdate.create(balObj, function(upErr, upRes) { });
  return true;
}

let checkVolume = exports.checkVolume = function (from_symbol, to_symbol, callback) {
  // var volume = 0;
  var check = {volume:0,newvolume:0};
  if(from_symbol == 'COAL') {
   let mapDb = mongoose.model('ordertemp');
     mapDb.aggregate([
      { $match: { firstCurrency:from_symbol, secondCurrency:to_symbol, cancel_id:null, datetime:{ $gte:new Date(new Date().setDate(new Date().getDate() - 1)) } } },
      { $group: { _id: null, 'volume':{ $sum:"$total" }, 'newvolume':{ $sum:"$filledAmount" } } },
      { $sort: { datetime:1 } }
      ]).exec(function(trdErr, trdRes) {
        if(trdRes[0] != undefined) {
          // volume = trdRes[0].volume.toFixed(8);
          check.volume = trdRes[0].volume.toFixed(8);
          check.newvolume = trdRes[0].newvolume.toFixed(8);
          callback(check);
        } else {
          callback(check);
        }
    });
  } else {
    callback(check);
  }
}