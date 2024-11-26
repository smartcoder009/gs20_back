const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
let common = require('../../helpers/common');
var endecrypt = require('../../helpers/newendecryption');
let tradeHelper = require('../../helpers/trade');
var logger = require('../../logger');
var validator = require('validator');
var async = require('async');

const pairDB = require('../../model/pairs');
const orderDB = require('../../model/CoinOrder');
const mapDb = require('../../model/mapping');
const profitDb = require('../../model/profit');
const currency = require('../../model/currency');
const path = require('path');
var socketio = require('socket.io');
var http = require('http');
var https = require('https');
const fs = require('fs');

const Binance = require('node-binance-api');
const binLiq = new Binance().options({
  APIKEY:'ZV7LVqnJ8o4moESXt5i7BomqZ0rmQtnUVJngO91e5JDGmDfjqBzlybEt3KFSoYhK',
  APISECRET:'Wznm47xgldA9rRElFzdHUtfYnqckiFjRuAvX1DMepFnkv8aiw9750kHpmLcndhbW'
});

const kuws    = require('kucoin-node-api')
const config    = {
  apiKey: '6558584acf1bfb000182cbb9',
  secretKey: '9657be9d-3f9c-4eef-bc11-157528eb3152',
  passphrase: 'gs20exchange',
  environment: 'live'
}
kuws.init(config);

const Client = require('node-rest-client').Client;
const restCli = new Client();

var mapTrade = function() {};
let _tradeMap = new mapTrade();

router.get('/getPairs', common.originMiddle, (req, res) => {
  try {
    common.getPairs((pairs) => {
      res.json({success:1, pairs:pairs});
    });
  } catch (e) {
    res.json({success:0, msg:"Something went wrong"});
  }
});

router.post('/pairInfo', common.checkUserId, (req, res) => {
  try {
    var userToken = endecrypt.encryptNew(0);
    if(req.userId != 0) {
      if(validator.isMongoId(req.userId)) { userToken = endecrypt.encryptNew(req.userId); }
    }
    let pairVal = validator.isEmpty(req.body.pair);
    if (pairVal) {
      return res.json({ success: 0, msg: "Invalid Request" });
    }
    var pair = req.body.pair;
    var pairs = pair.split('_');
    var from_symbol = pairs[0];
    common.tradeConfig(pair, (tradeData) => {
      common.checkVolume(from_symbol, 'USDT', (usdtVol) => {
        common.checkVolume(from_symbol, 'EUR', (eurVol) => {
          if (tradeData) {
            return res.json({ success:1, msg:tradeData, token:userToken, usdtVol: usdtVol.volume, eurVol: eurVol.volume });
          } else {
            return res.json({ success: 0, msg: "Invalid Pair" });
          }
        });
      });
    });
  } catch (e) {
    res.json({ success: 0, msg: "Something went wrong" });
  }
});

router.post('/orderHistory', common.userVerify, (req, res) => {
  try {
    let userId = req.userId;
    let pairVal = validator.isEmpty(req.body.pair);
    if (pairVal) {
      return res.json({ success: 0, msg: "Invalid Request" });
    }
    var pair = req.body.pair;
    var pairs = pair.split('_');
    if(pairs.length != 2) {
      return res.json({ success: 0, msg: "Invalid Pair" });
    }
    var first = pairs[0];
    var second = pairs[1];
    async.parallel({
      myHistory: function(cb) {
        mapDb.find({ firstCurrency: first, secondCurrency: second, $or: [{buyerUserId: mongoose.mongo.ObjectId(userId)}, {sellerUserId: mongoose.mongo.ObjectId(userId)}] }, {_id:0, sellerUserId:1, buyerUserId:1, askPrice:1, filledAmount:1, cancel_id:1, created_at:1, buy_fee:1, sell_fee:1}).sort({created_at: -1}).exec(cb)
      }
    }, function(err, results) {
      if(results) {
        var trade = results.myHistory;
        common.formatMyTrade(first, second, userId, trade, function(myRes) {
          return res.json({ success: 1, result: myRes });
        });
      } else {
        return res.json({ success: 0, msg: "Something went wrong" });
      }
    });
  } catch (e) {
    console.log(e.message);
    return res.json({ success:401 });
  }
});

let cancelOrderId = [];
router.post('/cancelOrder', common.userVerify, (req, res) => {
  try {
    let userId = req.userId;
    var usrTkn = cancelOrderId.indexOf(userId);
    if(usrTkn == -1) {
      cancelOrderId.push(userId);
      let tokenVal = validator.isEmpty(req.body.ttoken);
      if (tokenVal) {
        return res.json({ success: 0, msg: "Invalid Request" });
      }
      let oId = endecrypt.decryptNew(req.body.ttoken);
      tradeHelper.cancelOrder(oId, userId, (resOrder) => {
        var index = cancelOrderId.indexOf(userId);
        if (index > -1) {
          cancelOrderId.splice(index, 1);
        }
        return res.json(resOrder);
      });
    } else {
      return res.json({ success: 0, msg: "Please try again" });
    }
  } catch (e) {
    return res.json({ success:401, msg:"unauthorized" });
  }
});

router.get('/chart/:chartType', (req, res) => {
  try {
    let type = req.params.chartType;
    let coin = req.query.symbol;
    if (type == "symbols") {
      let res1 = { "has_volume": true, "has_weekly_and_monthly": true, "name": coin, "exchange-traded":"GS20 Exchange","exchange-listed":"GS20 Exchange","timezone": "UTC", "minmov": 1, "minmov2": 0, "pointvalue": 1, "session": "24x7", "has_intraday": true, "description": coin, "type": "stock", "supported_resolutions": [ "1", "5", "15", "30", "60", "1D", "1W", "1M" ], "pricescale": 100000000, "volume_precision": 8, "ticker": coin };
      res.json(res1);
      res.end();
    } else if (type == "config") {
      let res2 = {"supports_search":true,"supports_group_request":false,"supports_marks":true,"supports_timescale_marks":true,"supports_time":true,"exchanges":[{"value":"","name":"All Exchanges","desc":""},{"value":"GS20 Exchange","name":"GS20 Exchange","desc":"GS20 Exchange"}],"symbols_types":[{"name":"All types","value":""},{"name":"Cryptocurrency","value":"crypto"}],"supported_resolutions":[ "1", "5", "15", "30", "60", "1D", "1W", "1M" ]};    
      res.json(res2);
      res.end();
    } else if (type == "history") {    
      let from = req.query.from;
      let to = req.query.to;
      let resolution = req.query.resolution;
      getOhlc(coin, from, to, resolution, (res3)=>{
        res.json(res3);
        res.end();
      });
    } else {
      res.type('text/html');
      res.send('');
      res.end();
    }
  } catch (err) {
    console.log("chart request", err);
  }
});

let getOhlc = exports.getOhlc = async function(pair, from, to, resol, callback) {
  const nonLiq = ['COAL_USDT', 'COAL_GBP', 'COAL_EUR'];
  let liqIndex = nonLiq.indexOf(pair);
  let o = []; let c = []; let l = []; let h = []; let v = []; let t = [];
  let spl = pair.split("_");
  let first = spl[0];
  let second = spl[1];
  if(liqIndex > -1) {
    if (resol == "1D") {
      resol = 24 * 60 * 60;
    } else if (resol == "1W") {
      resol = 7 * 24 * 60 * 60;
    } else if (resol == "1M") {
      resol = 30 * 24 * 60 * 60;
    } else {
      resol = resol * 60;
    }
    resol = resol * 1000;
    let fromDate = new Date(from * 1000);
    let toDate = new Date(to * 1000);
    let groupBy = (resol > 0) ? { _id : { $floor : { $divide : ["$timeStamp",resol] } } } : { _id :  { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } } };
    let aggr = mapDb.aggregate();
    aggr.match({ firstCurrency:first, secondCurrency:second, cancel_id:null, created_at : { $gte:fromDate, $lte:toDate } });
    aggr.project({ timeStamp : { "$toLong" : "$created_at" }, askPrice : 1, filledAmount : 1, created_at : 1 });
    aggr.sort({ created_at : 1 });
    aggr.group({...groupBy,...{ created_at : { $first:"$created_at" }, low : { $min:"$askPrice" }, high : { $max:"$askPrice" }, open : { $first:"$askPrice" }, close : { $last:"$askPrice" }, volume : { $sum : { $multiply : ["$filledAmount","$askPrice"] } } }});
    aggr.sort({ created_at : 1 });
    aggr.exec((err, ordRes) => {
      if(!err && ordRes != null && ordRes.length > 0) {   
        for(let k in ordRes) {
          o.push(+ordRes[k].open);
          c.push(+ordRes[k].close);
          l.push(+ordRes[k].low);
          h.push(+ordRes[k].high);
          v.push(+ordRes[k].volume);
          t.push(common.formatTrdDate(ordRes[k].created_at));
        }
        callback({t:t, o:o, h:h, l:l, c:c, v:v, s:'ok'});
      } else {
        callback({s:'no_data'});
      }
    });
  } else {
   /* var selPair = first+second;
    let fromTime = from * 1000;
    let toTime = to * 1000;
    if(resol == '1')  {
      resol = '1m';
    } else if(resol == '5') {
      resol = '5m';
    } else if(resol == '15') {
      resol = '15m';
    } else if(resol == '30') {
      resol = '30m';
    } else if(resol == '60') {
      resol = '1h';
    } else if(resol == '240') {
      resol = '4h';
    } else if(resol == '1D') {
      resol = '1d';
    } else if(resol == '1W') {
      resol = '1w';
    } else if(resol == '1M') {
      resol = '1M';
    } else {
      resol = '1d';
    }
    binLiq.candlesticks(selPair, resol, (error, ticks, symbol) => {
      for (var i = 0; i < ticks.length; i++)  {
        let lastTick = ticks[i];
        let [time, open, high, low, close, volume, closeTime, assetVolume, trades, buyBaseVol, buyAssVol, ig] = lastTick;
        let op = +open,
        hi = +high,
        lo = +low,
        cl = +close,
        vo = +volume,
        ti = +time / 1000;
        o.push(op);
        c.push(cl);
        l.push(lo);
        h.push(hi);
        v.push(vo);
        t.push(ti);
      }
      callback({t:t, o:o, h:h, l:l, c:c, v:v, s:'ok'});
    }, {limit: 500, endTime: toTime});*/

    var selPair = first+'-'+second;
    let fromTime = from;
    let toTime = to;
    
    const to1 = Math.floor(Date.now() / 1000);
    var from1;
    if(resol == '1')  {
      from1 = to - 200 * 60; resol = '1min';
    } else if(resol == '3') {
      from1 = to - 3 * 200 * 60; resol = '3min';
    } else if(resol == '5') {
      from1 = to - 5 * 200 * 60; resol = '5min';
    } else if(resol == '15') {
      from1 = to - 15 * 200 * 60; resol = '15min';
    } else if(resol == '30') {
      from1 = to - 30 * 200 * 60; resol = '30min';
    } else if(resol == '60') {
      from1 = to - 60 * 200 * 60; resol = '1hour';
    } else if(resol == '120') {
      from1 = to - 120 * 200 * 60; resol = '2hour';
    } else if(resol == '240') {
      from1 = to - 240 * 200 * 60; resol = '4hour';
    } else if(resol == '1D') {
      from1 = to - 1440 * 200 * 60; resol = '1day';
    } else if(resol == '1W') {
      from1 = to - 10080 * 200 * 60; resol = '1week';
    } else if(resol == '1M') {
      from1 = to - 43200 * 200 * 60; resol = '1month';
    } else {
      from1 = to - 1440 * 200 * 60; resol = '1day';
    }

    var params = { symbol: selPair, startAt: from1, endAt: to, type: resol};
    kuws.getKlines(params).then(getLines=>{
      if(getLines.code == '200000') {
        var ticks = getLines.data;
        if(ticks.length > 0) {
          for (var i = 0; i < ticks.length; i++)  {
            let lastTick = ticks[i];
            let [time, open, close, high, low, volume, assetVolume] = lastTick;
            let op = +open,
            hi = +high,
            lo = +low,
            cl = +close,
            vo = +assetVolume,
            ti = +time;
            o.unshift(op);
            c.unshift(cl);
            l.unshift(lo);
            h.unshift(hi);
            v.unshift(vo);
            t.unshift(ti);
          }
          callback({t:t, o:o, h:h, l:l, c:c, v:v, s:'ok'});
        } else {
          callback({s:'no_data'});
        }
      } else {
        callback({s:'no_data'});
      }
    });
  }
}

router.get('/getPairs', (req, res) => {
  try {
    common.pairsConfig(function(pairData) {
      if (pairData) {
        return res.json({ status: 1, data: pairData });
      }
    });
  } catch (e) {
    res.json({ status: 0, data: "Something went wrong"});
  }
})

router.get('/pairData', (req, res) => {
  try {
    pairDB.find({status:1},{from_symbol:1,to_symbol:1}).exec(function(err, pairData) {
      if(pairData) {
        res.json({ status: 1, data: pairData });
      }
    })
  } catch (e) {
    res.json({ status: 0, data: "Something went wrong"});
  }
})


module.exports = router;