const express 	= require('express');
const router 	= express.Router();
const mongoose 	= require('mongoose');
const async 	= require('async');

const common 	= require('../../helpers/common');
const endecrypt = require('../../helpers/newendecryption');
const tradeHlp 	= require('../../helpers/trade');

const validator = require('validator');

//schemas
const currencyDB = require('../../model/currency');
const orderDB = require('../../model/CoinOrder');
const mapDb = require('../../model/mapping');
const pairDB = require('../../model/pairs');
const userDB = require('../../model/users');

let updatedDate = () => { return new Date(); };
let cancelOrderId = []; let usrListArr = [];
var mapTrade = function() {};
let _tradeMap = new mapTrade();

router.get('/api_key', common.tokenMiddleware, (req,res) => {
	let userId = req.userId;
	let validUser = validator.isMongoId(userId);
	if(!validUser) { return res.json({status:0, msg:"Invalid User"}); }
	userDB.findOne({_id:mongoose.mongo.ObjectId(userId)}, {api_key:1, secret_key:1}).exec(function (usrErr, usrData) {
		if(usrData) {
			updateApi(userId, usrData, function(resp) {
				if(resp) {
					res.json({status:1, result:resp});
				} else {
					res.json({status:0, msg:"Please try again later"});
				}
			});
		} else {
			res.json({status:0, msg:"Invalid User"});
		}
	});
});

async function updateApi(userId, usrData, cb) {
	if(usrData.api_key == "" && usrData.secret_key == "") {
		let apiKey = await endecrypt.generateKey();
		let secKey = await endecrypt.generateKey();
		updateVal = { api_key:apiKey, secret_key:secKey };
		userDB.updateOne({_id:userId}, { "$set": updateVal }).exec(function(err, resUp){
			if(resUp) {
				cb({api_key:apiKey, secret_key:secKey});
			} else {
				cb(false);
			}
		});
	} else {
		cb({api_key:usrData.api_key, secret_key:usrData.secret_key});
	}
}

async function getValues(from, to, lprice, callback) {
	mapDb.aggregate([
		{ $match: { firstCurrency:from, secondCurrency:to, cancel_id:null, datetime:{ $gte:new Date(new Date().setDate(new Date().getDate() - 1)) } } },
		{ $group: { _id: null, amt_volume:{ $sum:"$filledAmount" }, volume:{ $sum:"$total" }, price: { $first:"$askPrice" }, low: { $min:"$askPrice" }, high: { $max:"$askPrice" } } },
		{ $sort: { datetime:1 } }
		]).exec(function(trdErr, trdRes) {
			if(trdRes.length > 0) {
				lprice = parseFloat(lprice).toFixed(8);
          		var yesterPrice = trdRes[0].price;
          		var dailyChange = lprice - yesterPrice;
          		var per = (dailyChange / yesterPrice) * 100;
          		per = parseFloat(per).toFixed(2);
				var volume = trdRes[0].volume.toFixed(8);
          		var amt_volume = trdRes[0].amt_volume.toFixed(8);
          		var high = trdRes[0].high.toFixed(8);
          		var low = trdRes[0].low.toFixed(8);
				callback({from:from, to:to, change:per, lprice:lprice, volume:volume, amt_volume:amt_volume, high:high, low:low});
			} else {
              	callback({from:from, to:to, change:0, lprice:0, volume:0, amt_volume:0, high:0, low:0});
            }
		});
}

router.get('/markets', (req,res) => {
	var pairRes = {};
	pairDB.find({status:1}, {_id:0, from_symbol:1, to_symbol:1, change_per:1, last_price:1, prc_clr:1, volume:1, amt_volume:1, high:1, low:1, liquidity:1}).exec(function (err, resData) {
		if(resData.length > 0) {
			var pairRes = {};
			/*for (var i = 0; i < resData.length; i++) {
				var from = resData[i].from_symbol;
				var to = resData[i].to_symbol;
				pairRes[from+'_'+to] = { trading_pairs:from+'_'+to, last_price:parseFloat(resData[i].last_price).toFixed(8), quote_volume:resData[i].volume, base_volume:resData[i].amt_volume, highest_price_24h:resData[i].high, lowest_price_24h:resData[i].low, price_change_percent_24h:resData[i].change_per };
			}*/
			var i=0; var j=1;var len=resData.length;
			var comdata = [];
			resData.forEach((data)=>{
				var from = data.from_symbol;
				var to = data.to_symbol;
				var liquidity= data.liquidity;
				if(liquidity) {
					pairRes[from+'_'+to] = { trading_pairs:from+'_'+to, last_price:parseFloat(resData[i].last_price).toFixed(8), quote_volume:resData[i].volume, base_volume:resData[i].amt_volume, highest_price_24h:resData[i].high, lowest_price_24h:resData[i].low, price_change_percent_24h:resData[i].change_per };
				} else {
					comdata.push(data);
					var last_price = data.last_price;
					getValues(from, to, last_price, function(resp) {
						var last_price_val = (resp.lprice !== 0 ? resp.lprice : data.last_price);
						pairRes[resp.from+'_'+resp.to] = { trading_pairs:resp.from+'_'+resp.to, last_price:last_price_val, quote_volume:resp.volume, base_volume:resp.amt_volume, highest_price_24h:resp.high, lowest_price_24h:resp.low, price_change_percent_24h:resp.change };
						if(j==comdata.length){
							res.json({status:1, data:pairRes});
						}
						j++;
					});
				}
				i++;
			})
		} else {
			res.json({status:0, data:[]});
		}
	});
})

router.get('/endPoint1/:id', (req,res) => {
	var id = req.params.id;
	var pairs = id.split('_');
	var from = pairs[0];
	var to = pairs[1];
	var pairRes = {};
	pairDB.find({status:1, from_symbol:from, to_symbol:to}, {_id:0, from_symbol:1, to_symbol:1, change_per:1, last_price:1, prc_clr:1, volume:1, amt_volume:1, high:1, low:1, liquidity:1}).exec(async function (err, resData) {
		if(resData.length > 0) {
			var pairRes = {};
			for (var i = 0; i < resData.length; i++) {
				var from = resData[i].from_symbol;
				var to = resData[i].to_symbol;
				var liquidity= resData[i].liquidity;
				if(liquidity) {
					pairRes = { trading_pairs:from+'_'+to, last_price:parseFloat(resData[i].last_price).toFixed(8), quote_volume:resData[i].volume, base_volume:resData[i].amt_volume, highest_price_24h:resData[i].high, lowest_price_24h:resData[i].low, price_change_percent_24h:resData[i].change_per };
					res.json({status:1, data:pairRes});
				} else {
					var last_price = resData[i].last_price;
					await getValues(from, to, last_price, function(resp) {
						pairRes = { trading_pairs:from+'_'+to, last_price: resp.lprice, quote_volume:resp.volume, base_volume:resp.amt_volume, highest_price_24h:resp.high, lowest_price_24h:resp.low, price_change_percent_24h:resp.change };
						res.json({status:1, data:pairRes});
					});
				}
			}
		} else {
			res.json({status:0, data:[]});
		}
	});
})

router.get('/assets', (req,res) => {
	var currRes = {};
	currencyDB.find({status:1}, {_id:0, name:1, symbol:1, margin_status:1, deposit_status:1, withdraw_status:1, min_withdraw:1, max_withdraw:1, withdraw_fee:1}).exec(function (err, resData) {
		if(resData.length > 0) {
			var currRes = {};
			for (var i = 0; i < resData.length; i++) {
				var curr = resData[i].symbol;
				var margin_status = (resData[i].deposit_status) ? true : false;
				var deposit_status = (resData[i].deposit_status) ? true : false;
				var withdraw_status = (resData[i].withdraw_status) ? true : false;
				currRes[curr] = { currency:curr, name:curr, fullName:resData[i].name, isMarginEnabled:margin_status, isDepositEnabled:deposit_status, isWithdrawEnabled:withdraw_status, withdrawalMinSize:resData[i].min_withdraw, withdrawalMinFee:resData[i].withdraw_fee };
			}
			res.json({status:1, data:currRes});
		} else {
			res.json({status:0, data:[]});
		}
	});
})

router.get('/endPoint2/:curr', (req,res) => {
	var curr = req.params.curr;
	var currRes = {};
	currencyDB.find({status:1, symbol:curr}, {_id:0, name:1, symbol:1, margin_status:1, deposit_status:1, withdraw_status:1, min_withdraw:1, max_withdraw:1, withdraw_fee:1}).exec(function (err, resData) {
		if(resData.length > 0) {
			var currRes = {};
			for (var i = 0; i < resData.length; i++) {
				var curr = resData[i].symbol;
				var margin_status = (resData[i].deposit_status) ? true : false;
				var deposit_status = (resData[i].deposit_status) ? true : false;
				var withdraw_status = (resData[i].withdraw_status) ? true : false;
				currRes = { currency:curr, name:curr, fullName:resData[i].name, isMarginEnabled:margin_status, isDepositEnabled:deposit_status, isWithdrawEnabled:withdraw_status, withdrawalMinSize:resData[i].min_withdraw, withdrawalMinFee:resData[i].withdraw_fee };
			}
			res.json({status:1, data:currRes});
		} else {
			res.json({status:0, data:[]});
		}
	});
})

router.get('/tickers', (req,res) => {
	var pairRes = {};
	pairDB.find({status:1}, {_id:0, from_symbol:1, to_symbol:1, change_per:1, last_price:1, prc_clr:1, volume:1, amt_volume:1, high:1, low:1, liquidity:1}).exec(function (err, resData) {
		if(resData.length > 0) {
			var pairRes = {};
			/*for (var i = 0; i < resData.length; i++) {
				var from = resData[i].from_symbol;
				var to = resData[i].to_symbol;
				pairRes[from+'_'+to] = { trading_pairs:from+'_'+to, last_price:parseFloat(resData[i].last_price).toFixed(8), quote_volume:resData[i].volume, base_volume:resData[i].amt_volume, highest_price_24h:resData[i].high, lowest_price_24h:resData[i].low, price_change_percent_24h:resData[i].change_per };
			}*/
			var i=0; var j=1;var len=resData.length;
			var comdata = [];
			resData.forEach((data)=>{
				var from = data.from_symbol;
				var to = data.to_symbol;
				var liquidity= data.liquidity;
				if(liquidity) {
					pairRes[from+'_'+to] = { trading_pairs:from+'_'+to, last_price:parseFloat(resData[i].last_price).toFixed(8), quote_volume:resData[i].volume, base_volume:resData[i].amt_volume, highest_price_24h:resData[i].high, lowest_price_24h:resData[i].low, price_change_percent_24h:resData[i].change_per };
				} else {
					comdata.push(data);
					var last_price = data.last_price;
					getValues(from, to, last_price, function(resp) {
						pairRes[resp.from+'_'+resp.to] = { trading_pairs:resp.from+'_'+resp.to, last_price:resp.lprice, quote_volume:resp.volume, base_volume:resp.amt_volume, highest_price_24h:resp.high, lowest_price_24h:resp.low, price_change_percent_24h:resp.change };
						if(j==comdata.length){
							res.json({status:1, data:pairRes});
						}
						j++;
					});
				}
				i++;
			})
		} else {
			res.json({status:0, data:[]});
		}
	});
})

router.get('/endPoint3/:pair', (req,res) => {
	var pair = req.params.pair;
	var pairs = pair.split('_');
	var from = pairs[0];
	var to = pairs[1];
	var pairRes = {};
	pairDB.find({status:1, from_symbol:from, to_symbol:to}, {_id:0, from_symbol:1, to_symbol:1, change_per:1, last_price:1, prc_clr:1, volume:1, amt_volume:1, high:1, low:1, liquidity:1}).exec(async function (err, resData) {
		if(resData.length > 0) {
			var pairRes = {};
			for (var i = 0; i < resData.length; i++) {
				var from = resData[i].from_symbol;
				var to = resData[i].to_symbol;
				var liquidity= resData[i].liquidity;
				if(liquidity) {
					pairRes = { trading_pairs:from+'_'+to, last_price:parseFloat(resData[i].last_price).toFixed(8), quote_volume:resData[i].volume, base_volume:resData[i].amt_volume, highest_price_24h:resData[i].high, lowest_price_24h:resData[i].low, price_change_percent_24h:resData[i].change_per };
					res.json({status:1, data:pairRes});
				} else {
					var last_price = resData[i].last_price;
					await getValues(from, to, last_price, function(resp) {
						pairRes = { trading_pairs:from+'_'+to, last_price: resp.lprice, quote_volume:resp.volume, base_volume:resp.amt_volume, highest_price_24h:resp.high, lowest_price_24h:resp.low, price_change_percent_24h:resp.change };
						res.json({status:1, data:pairRes});
					});
				}
			}
		} else {
			res.json({status:0, data:[]});
		}
	});
})

router.get('/orderbook/:pair/:limit', (req,res) => {
	var pair = req.params.pair;
	var response = {};
	var pairs = pair.split('_');
	var from = pairs[0];
	var to = pairs[1];

	var limit = parseInt(req.params.limit);
	const limitArr = [ 5 , 10 , 20 , 50 , 100 , 500 ];
	let limitIndex = limitArr.indexOf(limit);
	limit = (limitIndex > -1) ? limit : 1
	
	var buyWhere = { firstCurrency:from, secondCurrency:to, Type:'buy', status: { $in:['active', 'partially']} };
	var sellWhere = { firstCurrency:from, secondCurrency:to, Type:'sell', status: { $in:['active', 'partially']}};
	async.parallel({
		BuyOrder : function(cb) {
			orderDB.aggregate([
				{ $match : buyWhere },
				{ $project : { oid:'$_id', Price:'$Price', status:'$status', Amount:{$sum:'$Amount'} } },
				{ $group : { '_id':'$Price', 'Amount':{$sum:'$Amount'}, 'Price':{ $first:'$Price' }, 'status':{ $first:'$status' }, 'oid':{ $first:'$_id' } } },
				{ $sort : { Price:-1, _id:-1 } },
				{ $limit : limit }
				]).exec(cb)
		},
		SellOrder : function (cb) {
			orderDB.aggregate([
				{ $match : sellWhere },
				{ $project : { oid:'$_id', Price:'$Price', status:'$status', Amount:{$sum:'$Amount'} } },
				{ $group : { '_id':'$Price', 'Amount':{$sum:'$Amount'}, 'Price':{ $first:'$Price' }, 'status':{ $first:'$status' }, 'oid':{ $first:'$_id' } } },
				{ $sort : { Price:1, _id:1 } },
				{ $limit : limit }
				]).exec(cb)
		}
	},function(err, results){
		if(results) {
			var buy = results.BuyOrder;
			var sell = results.SellOrder;
			formatOrders(buy, 'Buy', function(buyRes) {
				formatOrders(sell, 'Sell', function(sellRes) {
					res.json({status:1, bids:buyRes, asks:sellRes});
				})
			})
		} else {
			res.json({status:0, bids:[], asks:[]});
		}
	})
})

function formatOrders(ord, type, callback) {
	if(ord.length > 0) {
		var ords = [];
		var ordArr; var oSum = 0; var i = 1; var len = ord.length;
		ord.forEach((val) => {
			var price = val.Price;
			var amount = val.Amount;
			common.checkOrderTemp(val.status, type, mongoose.mongo.ObjectId(val.oid), function(fillAmt) {
				var filled = parseFloat(amount) - parseFloat(fillAmt);
				oSum = oSum + filled;
				ordArr = { 'amount':parseFloat(filled).toFixed(8), 'price':parseFloat(price).toFixed(8)};
				ords.push(ordArr);
				if(i == len) { callback(ords); }
				i = i + 1;
			})
		});
	} else {
		callback([]);
	}
}

router.get('/trades/:pair', (req,res) => {
	var pair = req.params.pair;
	var response = {};
	var pairs = pair.split('_');
	var from = pairs[0];
	var to = pairs[1];
	async.parallel({
		TradeHistory : function(cb) {
			mapDb.find({firstCurrency:from, secondCurrency:to, cancel_id:null}, {filledAmount:1, _id:0, askPrice:1, created_at:1, sellorderId:1, buyorderId:1}).sort({created_at:-1}).limit(50).exec(cb)
		}
	}, function(err, results) {
		if(results) {
			var trade = results.TradeHistory;
			formatTrade(trade, function(tradeRes) {
				return res.json({ status: 1, data: tradeRes });
			});
		} else {
			res.json({status:0, data:[]});
		}
	});
})

function formatTrade(trade, callback) {
	if(trade.length > 0) {
		var histArr; var tradeHists = []; var i = 1; var len = trade.length;
		trade.forEach((tval) => {
			var type = (tval.buyorderId > tval.sellorderId) ? "Buy" : "Sell";
			histArr = {'ctime':toTimestamp(tval.created_at), 'amount':tval.filledAmount.toFixed(8), 'price':tval.askPrice.toFixed(8), 'type':type};
			tradeHists.push(histArr);
			if(i == len) { callback(tradeHists); }
			i = i + 1;
		});
	} else {
		callback([]);
	}
}

function toTimestamp(strDate){
	var datum = Date.parse(strDate);
	return datum/1000;
}

router.post('/getBalance', common.apiMiddleware, (req,res) => {
	let info = req.body;
	if(info.currency == undefined || info.currency == "") {
		res.json({status:0, error:'Invalid request'});
	}
	let userId = req.userId;
	let validUser = validator.isMongoId(userId);
	if(!validUser) { return res.json({status:401, error:"Invalid user"}); }
	let curr = info.currency;
	currencyDB.findOne({symbol:curr}, {_id:1}).exec(function(curErr, curRes) {
		if(curRes) {
			common.findUserBalance(userId, curr, function(balRes) { 
				res.json({status:1, data:balRes});
			});
		} else {
			res.json({status:0, data:0.00});
		}
	})
});

router.post('/openOrders', common.apiMiddleware, (req,res) => {
	let info = req.body;
	if(info.pair == undefined || info.pair == "") {
		res.json({status:0, error:'Invalid request'});
	}
	let userId = req.userId;
	let validUser = validator.isMongoId(userId);
	if(!validUser) { return res.json({status:401, error:"Invalid user"}); }
	let pair = info.pair;
	var pairs = pair.split('_');
	if(pairs.length != 2) {
		res.json({status:0, error:"Invalid pair"});
	}
	let first = pairs[0];
	let second = pairs[1];
	orderDB.find({ user_id:mongoose.mongo.ObjectId(userId), firstCurrency:first, secondCurrency:second, status: { $in:['active', 'partially']}, ordertype:{$ne:'market'} }, {Price:1, Amount:1, fee_per:1, Type:1, ordertype:1, status:1, created_at:1}).sort({_id: -1}).exec(function(openErr, openRes) {
		if(openRes) {
			common.formatOpen(first, second, userId, openRes, function(resp) {
				res.json({status:1, data:resp});
			});
		} else {
			res.json({status:0, data:[]});
		}
	});
});

router.post('/tradeHistory', common.apiMiddleware, (req,res) => {
	let info = req.body;
	if(info.pair == undefined || info.pair == "") {
		res.json({status:0, error:'Invalid request'});
	}
	let userId = req.userId;
	let validUser = validator.isMongoId(userId);
	if(!validUser) { return res.json({status:401, error:"Invalid user"}); }
	let pair = info.pair;
	var pairs = pair.split('_');
	if(pairs.length != 2) {
		res.json({status:0, error:"Invalid pair"});
	}
	let first = pairs[0];
	let second = pairs[1];
	mapDb.find({firstCurrency:first, secondCurrency:second, cancel_id:null}, {filledAmount:1, _id:0, askPrice:1, created_at:1, sellorderId:1, buyorderId:1}).sort({created_at:-1}).exec(function(trdErr, trdRes) {
		if(trdRes) {
			formatTrade(trdRes, function(resp) {
				res.json({status:1, data:resp});
			});
		} else {
			res.json({status:0, data:[]});
		}
	})
});

router.post('/placeOrder', common.apiMiddleware, (req, res) => {
	try {
		let info = req.body;
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({status:0, msg:"Invalid User"}); }
		let amtVal = validator.isEmpty(info.amount);
		let amtNum = validator.isNumeric(info.amount);
		let prcVal = validator.isEmpty(info.price);
		let prcNum = validator.isNumeric(info.price);
		let pairVal = validator.isEmpty(info.pair);
		let ordVal = validator.isEmpty(info.order);
		let typeVal = validator.isEmpty(info.type);
		if(amtVal || !amtNum || prcVal || !prcNum || pairVal || ordVal || typeVal) {
			return res.json({status:0, msg:"Please enter all details"});
		}
		let uId = userId.toString();
		var resp = {};
		resp['success'] = 0,
		resp['msg'] = '',
		resp['type'] = info['type'].toLowerCase(),
		resp['ordertype'] = info['order'],
		resp['pair'] = info['pair'];

		var pair = info['pair'],
		amount = parseFloat(info['amount']),
		price = parseFloat(info['price']),
		order = info['order'],
		type = info['type'].toLowerCase();
		if (parseFloat(amount) <= 0 || parseFloat(price) <= 0 || amount == "" || price == "") {
			return res.json({status:0, msg:"Enter valid amount & price"});
		}
		var pairs = pair.split('_');
		if(pairs.length != 2) { return res.json({status:0, msg:"Invalid pair"}); }
		let first = pairs[0];
		let second = pairs[1];
		userDB.findOne({_id:mongoose.mongo.ObjectId(userId)}, {status:1}).exec(function (usrErr, usrData) {
			if(usrData) {
				if(usrData.status != 1) { return res.json({status:0, msg:"Invalid request"}); }
				pairDB.findOne({"from_symbol":first, "to_symbol":second, "status":1}, {_id:0, trade_fee:1, last_price:1, min_amt:1}).exec(function (err, getPair) {
					if(getPair) {
						let lastPrice = parseFloat(getPair.last_price);
						let feePer = parseFloat(getPair.trade_fee);
						let minAmt = parseFloat(getPair.min_amt);
						let oppType = (type == "buy") ? "sell" : "buy";
						price = (order == "market") ? lastPrice : price;
						if(order == "stoplimit") {
							if(type == "buy" && price <= lastPrice) {
								return res.json({status:0, msg:"Enter price above "+lastPrice});
							} else if(type == "sell" && price >= lastPrice) {
								return res.json({status:0, msg:"Enter price below "+lastPrice});
							}
						}
						let subtotal = amount * price;
						let feeAmt = (subtotal * feePer) / 100;
						let total = (type == "buy") ? subtotal + feeAmt : subtotal - feeAmt;
						let balCurr = (type == "buy") ? second : first;
						common.findUserBalance(userId, balCurr, function(balRes) {
							var balance = parseFloat(balRes);
							if(order != "market") {
								if ((total > balance && type == "buy") || (amount > balance && type == "sell")) {
									return res.json({status:0, msg:"Insufficient Balance"});
								}
							}
							if(order == "market") {
								if ((amount > balance && type == "sell")) {
									return res.json({status:0, msg:"Insufficient Balance"});
								}
							}
							let selPair = first + second;
							let liquidity = "gs20";
							common.checkActiveOrder(first, second, oppType, userId, order, function(actRes) {
								if(actRes) {
									var status = (order == "stoplimit") ? "stoplimit" : ((order == "market") ? "market" : "active");
									var cliId = common.randomString(9) + new Date().getTime() + common.randomString(7);
									let orderJson = {
										user_id: mongoose.mongo.ObjectId(userId), Amount: amount.toFixed(8), Price: price.toFixed(8), Type: type, ordertype: order, Fee: feeAmt.toFixed(8), fee_per: feePer, Total: total.toFixed(8), status: status, firstCurrency: first, secondCurrency: second, clientOrder: cliId, user_type:"api"
									};
									orderDB.create(orderJson, function(insErr, insRes) {
										if(insRes) {
											resp['liquidity'] = liquidity;
											resp['token'] = endecrypt.encryptNew(uId);
											resp['success'] = 1;
											resp['lastId'] = insRes._id;
											resp['order'] = insRes;
											if(order == "market") {
												tradeHlp.createResponse(resp, pair, liquidity);
												let resArr = { "order_id":insRes._id.toString(), "token":endecrypt.encryptNew(insRes._id.toString()), "amount":insRes.Amount, "price":insRes.Price, "client_order_id":insRes.clientOrder }
												return res.json({status:1, msg:"Order Placed", result:resArr});
											} else {
												var upBal = (type == "buy") ? balance - parseFloat(total) : balance - parseFloat(amount);
												upBal = parseFloat(upBal).toFixed(8);
												common.updateUserBalance(userId, balCurr, upBal, function(upRes) {
													if(upRes) {
														console.log({"userid":userId, "currency":balCurr, "exist":balance, "new":upBal, "id":insRes._id, "type":"Order Place", "time":new Date()});
														tradeHlp.createResponse(resp, pair, liquidity);
														let resArr = { "order_id":insRes._id.toString(), "token":endecrypt.encryptNew(insRes._id.toString()), "amount":insRes.Amount, "price":insRes.Price, "client_order_id":insRes.clientOrder }
														return res.json({status:1, msg:"Order Placed", data:resArr});
													} else {
														return res.json({status:0, msg:"Failed to update balance"});
													}
												});
											}
										} else {
											return res.json({status:0, msg:"Failed to create an order"});
										}
									});
								} else {
									return res.json({status:0, msg:"No "+oppType+" orders available"});
								}
							})
						});
					} else {
						return res.json({status:0, msg:"Invalid pair"});
					}
				});
			} else {
				return res.json({status:0, msg:"Invalid User"});
			}
		});
} catch (e) {
	return res.json({status:0, msg:"Something went wrong"});
}
});

router.post('/cancelOrder', common.apiMiddleware, (req, res) => {
	try {
		let userId = req.userId;
		var usrTkn = cancelOrderId.indexOf(userId);
		if(usrTkn == -1) {
			cancelOrderId.push(userId);
			let tokenVal = validator.isEmpty(req.body.token);
			if (tokenVal) {
				return res.json({ status: 0, msg: "Invalid Request" });
			}
			let oId = endecrypt.decryptNew(req.body.token);
			tradeHlp.cancelOrder(oId, userId, (resOrder) => {
				var index = cancelOrderId.indexOf(userId);
				if (index > -1) {
					cancelOrderId.splice(index, 1);
				}
				return res.json(resOrder);
			});
		} else {
			return res.json({ status: 0, msg: "Please try again" });
		}
	} catch (e) {
		return res.json({ status:0, msg:"Something went wrong" });
	}
});

module.exports = router;