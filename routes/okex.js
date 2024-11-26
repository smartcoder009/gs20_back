const mongoose = require('mongoose');
const cron = require('node-cron');

const common = require('../helpers/common');
const pairsDB = require('../model/pairs');
const orderDB = require('../model/CoinOrder');
const mapDb = require('../model/mapping');
const binDb = require('../model/binOrders');
const currDb = require('../model/currency');
var _tradeMap = require('../helpers/trade.js');

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const _promises = new Map();
var socket = 0;

const CoinMarketCap = require('coinmarketcap-api')
const apiKey = 'ec3ada5a-5058-4d47-85b9-e48423877743';
const client = new CoinMarketCap(apiKey)

const Client = require('node-rest-client').Client;
const restCli = new Client();

exports.SocketInit = function(socketIO) {
  common.SocketInit(socketIO);
  socket = socketIO;
}

// probitTickers();
var proVolume = indVolume = 0; const proTics = [];

function probitTickers() {
  const websocketUrl = 'wss://api.probit.com/api/exchange/v1/ws';
  const subscribeMessage = JSON.stringify({
    type: 'subscribe',
    channel: 'marketdata',
    interval: 0,
    market_id: 'COAL-BTC',
    filter: ['ticker']
  });
  const probitWS = new WebSocket(websocketUrl);

  probitWS.on('open', () => {
    console.log('WebSocket connection opened.');
    probitWS.send(subscribeMessage);
  });

  probitWS.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.channel === 'marketdata') {
      var ticker = data.ticker;
      var base_volume = ticker.base_volume;
      var quote_volume = ticker.quote_volume;
      proVolume = base_volume;
    }
  });

  probitWS.on('error', (error) => {
    console.error(`WebSocket error: ${error}`);
    probitTickers();
  });

  probitWS.on('close', () => {
    console.log('WebSocket connection closed.');
    probitTickers();
  });
}

const ccxt = require('ccxt');
let Indodax = new ccxt.indodax({
 apiKey: 'MUB11APZ-FUZI7UCL-NG4ATCQN-0KMEUPMC-OFIFG6TN',
 secret: '36c5cc36a7a9b808c2ef59a72f22b7934a00397361d58ccd211e589044beea1202307a7b1c32a6d9'
})

cron.schedule('*/1 * * * * *', () => {
  (async function () {
    let ticker = await Indodax.fetchTicker('COAL/IDR');
    if(ticker.info != undefined) {
      indVolume = ticker.info.vol_coal;
    }
  })();
});

cron.schedule('*/1 * * * * *', () => {
  coalVolume();
});

function coalVolume() {
  socket.sockets.emit('coalVolume', {'probit': proVolume, 'indodax': indVolume});
}

const kuws = require('kucoin-node-api');
const KUCOIN_API_KEY = '66a20169c6688800013cda74';
const KUCOIN_API_SECRET = '1175e15d-f912-40ce-9456-75ca99508924';
const KUCOIN_API_PASSPHRASE = 'Hive@1234!';

const config    = {
  apiKey: KUCOIN_API_KEY,
  secretKey: KUCOIN_API_SECRET,
  passphrase: KUCOIN_API_PASSPHRASE,
  environment: 'live'
}
kuws.init(config);

var kucTics = [];  var kucBoks = {}; var kucTrds = {};
var kuPairs = 'BTC-USDC,ETH-USDC,XRP-USDC,TRX-USDC,BTC-EUR,ETH-EUR';

const subscribe_tickers = {
  id: 'subscribe_tickers',
  type: 'subscribe',
  topic: `/market/snapshot:${kuPairs}`,
  response: true,
};

const subscribe_orderbook = {
  id: 'subscribe_orderbook',
  type: 'subscribe',
  topic: `/spotMarket/level2Depth50:${kuPairs}`,
  response: true,
};

const subscribe_match = {
  id: 'subscribe_match',
  type: 'subscribe',
  topic: `/market/match:${kuPairs}`,
  response: true,
};

kucoinWebsocket();

function kucoinWebsocket() {
  try {
    restCli.post("https://api.kucoin.com/api/v1/bullet-public", {headers: {"Content-Type":"application/json"}}, function (tokenObj, response) {
      const kws = new WebSocket(`wss://ws-api-spot.kucoin.com/?token=${tokenObj.data.token}`);
      kws.on('open', () => {
        console.log('Kucoin WebSocket connection opened');
        kws.send(JSON.stringify(subscribe_tickers));
        kws.send(JSON.stringify(subscribe_orderbook));
        kws.send(JSON.stringify(subscribe_match));
      });
      kws.on('message', (data) => {
        const message = JSON.parse(data);
        var topic = message.topic;
        if(topic != undefined) {
          var sym = topic.split(':');
          var pairSym = sym[1];
          if(message.type === 'message') {
            if (message.subject === 'trade.snapshot') {
              let ticks = message.data;
              if(kucTics[pairSym] != undefined) {
                delete kucTics[pairSym];
                kucTics[pairSym] = ticks.data;
              } else {
                kucTics[pairSym] = ticks.data;
              }
            } else if (message.subject === 'level2') {
              let ordrs = message.data;
              let bids = ordrs.bids;
              let asks = ordrs.asks;
              let hist = {'bids':bids, 'asks':asks};
              kucBoks[pairSym] = {'bids':bids, 'asks':asks};
            } else if(message.subject === 'trade.l3match') {
              let match = message.data;
              let hist = {'quantity':match.size, 'price':match.price, 'timestamp':convertTime(match.time), 'side':match.side}
              if(kucTrds[pairSym] != undefined) {
                kucTrds[pairSym].unshift(hist);
                if(kucTrds[pairSym].length > 49) {
                  kucTrds[pairSym].pop();
                }
              } else {
                kucTrds[pairSym] = [];
                kucTrds[pairSym].unshift(hist);
              }
            }
          }
        }
      });
      kws.on('close', () => {
        console.log('Kucoin WebSocket connection closed');
        kucoinWebsocket();
      });
      kws.on('error', (err) => {
        console.error('Kucoin WebSocket error:', err);
        kucoinWebsocket();
      });
    });
  } catch (error) {
    console.error('Kucoin Error:', error.message);
    kucoinWebsocket();
  }
}

cron.schedule('*/1 * * * * *', () => {
  kucoinTickers();
});

cron.schedule('*/10 * * * * *', () => {
  kucoinValues();
});

cron.schedule('*/1 * * * * *', () => {
  kucoinBooks('btc_usdc', 'BTC-USDC');
  kucoinBooks('eth_usdc', 'ETH-USDC');
  kucoinBooks('xrp_usdc', 'XRP-USDC');
  kucoinBooks('trx_usdc', 'TRX-USDC');
  kucoinBooks('btc_eur', 'BTC-EUR');
  kucoinBooks('eth_eur', 'ETH-EUR');
});

cron.schedule('*/1 * * * * *', () => {
  kucoinTrades('btc_usdc', 'BTC-USDC');
  kucoinTrades('eth_usdc', 'ETH-USDC');
  kucoinTrades('xrp_usdc', 'XRP-USDC');
  kucoinTrades('trx_usdc', 'TRX-USDC');
  kucoinTrades('btc_eur', 'BTC-EUR');
  kucoinTrades('eth_eur', 'ETH-EUR');
});

function kucoinTickers() {
  let pairs = Object.keys(kucTics);
  const resArr = [];
  if(pairs.length > 0) {
    for (var i = 0; i < pairs.length; i++) {
      var pairId = pairs[i];
      var splits = pairId.split('-');
      var from = splits[0];
      var to = splits[1];
      let lprice = parseFloat(kucTics[pairId].lastTradedPrice);
      let open = parseFloat(kucTics[pairId].open);
      // let per = parseFloat(kucTics[pairId].changeRate).toFixed(2);
      var change = lprice - open;
      var per = (change / open) * 100;
      per = parseFloat(per).toFixed(2);
      let clr = (lprice > open) ? 1 : ((lprice == open) ? 0 : 2);
      let vol = parseFloat(kucTics[pairId].volValue).toFixed(8);
      let amtvol = parseFloat(kucTics[pairId].vol).toFixed(8);
      let high = parseFloat(kucTics[pairId].high).toFixed(8);
      let low = parseFloat(kucTics[pairId].low).toFixed(8);
      var pairRes = { change:per, from:from, to:to, pair:from+'_'+to, price:lprice.toFixed(8), clr:clr, volume:vol, amt_volume:amtvol, high:high, low:low };
      resArr.push(pairRes);
      var room = 'binance_'+from+'_'+to;
      socket.sockets.in(room).emit('binance_ticker_'+from+'_'+to, {data:pairRes});
      if(pairs.length == resArr.length) {
        // common.allPairInfo(resArr, 'binance', socket);
        allPairInfo(resArr);
      }
    }
  }
}

function allPairInfo(resArr) {
  let i = 1; let len = resArr.length; const pairData = {};
  resArr.forEach((resp) => {
    let selPair = resp.from+'_'+resp.to;
    let clr = (resp.clr == 1) ? "text-success" : ((resp.clr == 2) ? "text-danger" :"");
    let resJson = { from:resp.from, to:resp.to, pair:selPair, change:resp.change, price:resp.price, clr:clr, volume:resp.volume, amtvol:resp.amtvol, high:resp.high, low:resp.low };
    pairData[selPair] = resJson;
    if(i == len) {
      socket.sockets.emit('binance_allPairInfo', { 'pairinfo':pairData });
    }
    i = i + 1;
  });
}

async function kucoinValues() {
  pairs = Object.keys(kucTics);
  const resArr = [];
  length = pairs.length;
  if(length > 0) {
    for (var i = 0; i < length; i++) {
      var pairId = pairs[i];
      let splits = pairId.split('-');
      let from = splits[0];
      let to = splits[1];
      let lprice = parseFloat(kucTics[pairId].lastTradedPrice);
      let open = parseFloat(kucTics[pairId].open);
      let per = parseFloat(kucTics[pairId].changeRate).toFixed(2);
      let clr = (lprice > open) ? 1 : ((lprice == open) ? 0 : 2);
      let vol = parseFloat(kucTics[pairId].volValue).toFixed(8);
      let amtvol = parseFloat(kucTics[pairId].vol).toFixed(8);
      let high = parseFloat(kucTics[pairId].high).toFixed(8);
      let low = parseFloat(kucTics[pairId].low).toFixed(8);
      let pairRes = { change:per, from:from, to:to, price:lprice.toFixed(8), clr:clr, volume:vol, amtvol:amtvol, high:high, low:low };
      _tradeMap.activateStop(from, to, lprice);
      resArr.push(pairRes);
      if(pairs.length == resArr.length) {
        await bulkUp(resArr);
      }
    }
  } 
}

async function bulkUp(opts) {
  const bulkData = opts.map(opt => ({ 
    updateOne: { 
      filter: { from_symbol:opt.from, to_symbol:opt.to }, 
      update: { $set: { change_per:opt.change, last_price:opt.price, volume:opt.volume, amt_volume:opt.amtvol, high:opt.high, low:opt.low, prc_clr:opt.clr } },
      upsert: false
    } 
  }));
  await pairsDB.bulkWrite(bulkData, function(err, res) { });
}

function kucoinBooks(pair, apiPair) {
  if(kucBoks[apiPair] != undefined) {
    var bidArr = Object.keys(kucBoks[apiPair]['bids']).map(function(key){
      return {price: parseFloat(kucBoks[apiPair]['bids'][key][0]).toFixed(8), amount: parseFloat(kucBoks[apiPair]['bids'][key][1]).toFixed(8)};
    });
    var askArr = Object.keys(kucBoks[apiPair]['asks']).map(function(key){
      return {price: parseFloat(kucBoks[apiPair]['asks'][key][0]).toFixed(8), amount: parseFloat(kucBoks[apiPair]['asks'][key][1]).toFixed(8)};
    });
    var room = 'binance_'+pair.toUpperCase();
    socket.sockets.in(room).emit('binance_data_'+pair, {asks:askArr, bids:bidArr});
  }
}

function kucoinTrades(pair, apiPair) {
  if(kucTrds[apiPair] != undefined) {
    var room = 'binance_'+pair.toUpperCase();
    socket.sockets.in(room).emit('binance_history_'+pair, {'success':true,'data':kucTrds[apiPair]});
  }
}

function convertTime(timestampNanoseconds) {
  const convertTimestamp = (timestampNanoseconds / 1000) / 1000;
  return convertTimestamp;
}

cron.schedule('*/3 * * * * *', () => {
  getFills();
  processOrders();
});

async function getFills() {
  var fills = await kuws.listFills();
  if(fills.code == '200000') {
    var items = fills.data.items;
    if(items.length > 0) {
      items.forEach(async (val) => {
        binDb.findOne({orderId: val.orderId}, {_id:1}).exec(function(binErr,binRes) {
          if(!binRes) {
            binDb.create({orderId: val.orderId, order:JSON.stringify(val)});
          }
        });
      });
    }
  }
}

async function processOrders() {
  binDb.find({status:0}, {order:1}).sort({_id:1}).exec(function(ordErr, ordRes) {
    if(ordRes && ordRes.length > 0) {
      ordRes.forEach(async (val) => {
        let id = val._id;
        let ordVal = JSON.parse(val.order);
        await kucoinOrders(ordVal, function(resp) {
          binDb.updateOne({_id:id}, {$set:{status:1, updated_at:new Date()}}).exec(function(upErr, upRes) { });
        });
      });
    }
  });
}

async function kucoinOrders(liqData, cb) {
  var resData = liqData;
  if(resData.orderId != undefined) {
    var cliId = resData.orderId;
    checkOrder(cliId, 'binance', function(lastOrder) {
      if(lastOrder) {
        let trdId = lastOrder._id;
        let usrId = lastOrder.user_id;
        let from = lastOrder.firstCurrency;
        let to = lastOrder.secondCurrency;
        let ordType = lastOrder.Type;
        let order = lastOrder.ordertype;
        let ordPrc = parseFloat(lastOrder.Price);
        let ordSts = "filled";
        let ordAmt = parseFloat(lastOrder.Amount);
        let upType = (ordType == "buy") ? "Buy" : "Sell";

        var amount = ordAmt;
        var fillPrice = parseFloat(resData.price);
        var total1 = amount * ordPrc;
        var total2 = amount * parseFloat(fillPrice);
        if(order == "limit") {
          if(ordType == "buy" && ordPrc > parseFloat(fillPrice)) {
            var addPrice = parseFloat(total1) - parseFloat(total2);
            var tradeFee = addPrice * lastOrder.fee_per / 100;
            common.findUserBalance(usrId, to, function(buyBal) {
              var buyUp = parseFloat(buyBal) + parseFloat(addPrice) + parseFloat(tradeFee);
              common.updateUserBalance(usrId, to, buyUp, function(bu){
                console.log({"userid":usrId, "currency":to, "exist":buyBal, "new":buyUp, "id":trdId, "type":"Buy User return", "time":new Date()});
              });
            })
          }
          var total = amount * fillPrice;
        } else {
          var total = amount * ordPrc;
        }
        var feeAmt = (total * lastOrder.fee_per) / 100;
        if(parseFloat(amount) > 0) {
          let tempJson = {};
          if(ordType == "buy") {
            tempJson = { sellorderId: mongoose.mongo.ObjectId(0), sellerUserId: mongoose.mongo.ObjectId(0), askAmount: parseFloat(amount), askPrice: fillPrice, firstCurrency: from, secondCurrency: to, filledAmount: parseFloat(amount), buyorderId: trdId, buyerUserId: usrId, buy_fee: parseFloat(feeAmt), sell_fee: 0, total: parseFloat(total), pair: from+'_'+to, datetime: new Date() };
          } else if(ordType == "sell"){
            tempJson = { sellorderId: trdId, sellerUserId: usrId, askAmount: parseFloat(amount), askPrice: fillPrice, firstCurrency: from, secondCurrency: to, filledAmount: parseFloat(amount), buyorderId: mongoose.mongo.ObjectId(0), buyerUserId: mongoose.mongo.ObjectId(0), buy_fee: 0, sell_fee: parseFloat(feeAmt), total: parseFloat(total), pair: from+'_'+to, datetime: new Date() };
          }  
          mapDb.create(tempJson, function(tempErr, tempRes)  {
            _tradeMap._binanceCompleteOrd(trdId, ordType, from, to, usrId.toString(), amount, fillPrice, lastOrder.fee_per, ordSts, (resOrder) => {
              if(resOrder) {
                _tradeMap.binanceCronUp(from, to, usrId.toString(), fillPrice,(rescron) =>{ });
              } else {
                console.log('binance update error -->', trdId);
              }
              cb(1);
            })
          });
        } else {
          cb(1);
        }
      } else {
        cb(1);
      }
    });
  } else {
    cb(1);
  }
}


function checkOrder(cliId, site, cb) {
  orderDB.findOne({clientOrder:cliId, site:site, status:{$in:['active', 'partially']}}, {_id:1, Amount:1, Price:1, fee_per:1, user_id:1, firstCurrency:1, secondCurrency:1, Type:1, ordertype:1}, async function(err, resp){
    if(resp) { cb(resp); } else { cb(false); }
  });
}