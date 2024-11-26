const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const validator = require('validator');
const async = require('async');
const common = require('../../helpers/common');
const encdec = require('../../helpers/newendecryption');

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

const currency = require('../../model/currency');
const wallet = require('../../model/userWallet');
const userAddress = require('../../model/userAddress');
const tradePairs = require('../../model/pairs');
const swapOrder = require('../../model/swapOrder');
const otcOrder = require('../../model/otcOrder');
const orderDb = require('../../model/CoinOrder');
const p2porderDb = require('../../model/p2pCoinOrder');
const notify = require('../../model/notify');
const users = require('../../model/users');

let response = {};
let updatedDate = ()=>{ return new Date(); };

router.get('/address', common.tokenMiddleware, (req, res) => {
	let userId = req.userId;
	userAddress.find({"user_id":userId}).exec(function(err, adrRs) {
		if (err) {
			res.json({status:false, data:'Something went wrong. Please try again'});
		} else {
			res.json({status:true, data:adrRs})
		}
	})
});

router.get('/swap_info', common.userVerify, (req,res) => {
	let userId = req.userId;
	async.parallel({
		currRes:function(cb) {
			tradePairs.find({swap_status:1}, {_id:0, from_symbol:1}).exec(cb)
		},
		userInfo:function(cb) {
			users.findOne({_id:userId}, {_id:0, primary_value:1, added_val:1}).exec(cb)
		}
	}, function(err, result) {
		if(result) {
			if(result.userInfo) {
				let usermail = encdec.decryptNew(result.userInfo.primary_value) + encdec.decryptNew(result.userInfo.added_val);
				res.json({success:1, result:result.currRes, email:usermail});
			} else {
				res.json({success:0, msg:"Invalid request"});
			}
		} else {
			res.json({success:0, msg:"Something went wrong"});
		}
	});
});

router.get('/convert_info', common.originMiddle, (req,res) => {
	async.parallel({
		currRes:function(cb) {
			tradePairs.find({swap_status:1}, {_id:0, from_symbol:1}).exec(cb)
		},
	}, function(err, result) {
		if(result) {
			if(result.currRes) {
				res.json({success:1, result:result.currRes});
			} else {
				res.json({success:0, msg:"Invalid request"});
			}
		} else {
			res.json({success:0, msg:"Something went wrong"});
		}
	});
});

router.post('/getConvertInfo', common.originMiddle, (req,res) => {
	let info = req.body;
	let from = info.from;
	let to = info.to;
	tradePairs.findOne({from_symbol:from, to_symbol:to, swap_status:1}, {_id:0, swap_min:1, swap_max:1, swap_fee:1, decimal:1, amt_decimal:1, last_price:1, min_amt:1}).exec(function(swpErr, swpRes) {
		if(swpRes) {
			let price = swpRes.last_price;
			let resp = { min:swpRes.swap_min, max:swpRes.swap_max, fees:swpRes.swap_fee, decimal:swpRes.decimal, amt_decimal:swpRes.amt_decimal, min_amt:swpRes.min_amt, from_bal:"0.00", to_bal:"0.00", price:parseFloat(price).toFixed(swpRes.decimal) };
			res.json({success:1, result:resp});
		} else {
			res.json({success:0});
		}
	});
});

router.post('/getSwapInfo', common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	let from = info.from;
	let to = info.to;
	tradePairs.findOne({from_symbol:from, to_symbol:to, swap_status:1}, {_id:0, swap_min:1, swap_max:1, swap_fee:1, decimal:1, amt_decimal:1, last_price:1, min_amt:1}).exec(function(swpErr, swpRes) {
		if(swpRes) {
			common.multiBalance(userId, from, to, function(multiBal) {
				if(multiBal) {
					let price = swpRes.last_price;
					let resp = { min:swpRes.swap_min, max:swpRes.swap_max, fees:swpRes.swap_fee, decimal:swpRes.decimal, amt_decimal:swpRes.amt_decimal, min_amt:swpRes.min_amt, from_bal:multiBal[from], to_bal:multiBal[to], price:parseFloat(price).toFixed(swpRes.decimal) };
					res.json({success:1, result:resp});
				} else {
					res.json({success:0});
				}
			});
		} else {
			res.json({success:0});
		}
	});
});


var mapSwap = function() {};
let _swapMap = new mapSwap();
var usrListArr = []; const nonLiqs = [];

mapSwap.prototype._unsetUsrId = (usrTkn) => {
	let index = usrListArr.indexOf(usrTkn);
	if(index > -1) {
		usrListArr.splice(index, 1);
	}
}

router.post('/swapOrder', common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	if(validator.isEmpty(info.from)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.to)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.amount)) { return res.json({success:0, msg:"Enter Quantity"}); }
	if(validator.isEmpty(info.mprice)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.type)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.market_type)) { return res.json({success:0, msg:"Invalid request"}); }

	let from = info.from;
	let to = info.to;
	let type = info.type;
	let mprice = info.mprice;
	let marType = info.market_type;
	let amount = parseFloat(info.amount);
	var usrTkn = usrListArr.indexOf(userId.toString());
	if(usrTkn == -1) {
		usrListArr.push(userId.toString());
		setTimeout(_swapMap._unsetUsrId, 2000, userId.toString());
		tradePairs.findOne({from_symbol:from, to_symbol:to, swap_status:1}, {_id:0, swap_min:1, swap_max:1, swap_fee:1, last_price:1, min_amt:1, decimal:1, amt_decimal:1}).exec(function(swpErr, swpRes) {
			if(swpRes) {
				let selPair = from + to;
				let feePer = parseFloat(swpRes.swap_fee);
				let minAmt = parseFloat(swpRes.min_amt);
				let deci = parseInt(swpRes.decimal);
				let amtdec = parseInt(swpRes.amt_decimal);
				if(amount < minAmt && marType == "amount") {
					return res.json({success:0, msg:"Enter amount more than "+minAmt});
				}
				// binLiq.prices(selPair, (error, ticPrc) => {
					let trdPair = from + '-' +to;
					kuws.getTicker(trdPair).then(ticker=>{
					// if(!error && ticPrc[selPair] != undefined) {
						if(ticker.code == '200000') {
						// let price = parseFloat(ticPrc[selPair]);
						let price = parseFloat(ticker.data.price);
						var total = (marType == "amount") ? amount * price : amount;
						var fees = (total * feePer) / 100;
						total = parseFloat(total).toFixed(8);
						fees = parseFloat(fees).toFixed(8);
						var subTotal = (type == "buy") ? total + fees : total - fees;
						if(parseFloat(subTotal) < swpRes.swap_min) {
							return res.json({success:0, msg:"Minimum order size is "+swpRes.swap_min+" "+to});
						}
						if(parseFloat(subTotal) > swpRes.swap_max) {
							return res.json({success:0, msg:"Maximum order size is "+swpRes.swap_max+" "+to});
						}
						if(marType == "total") {
							amount = amount / price;
							amount = amount.toFixed(amtdec);
							amount = parseFloat(amount);
						}
						common.multiBalance(userId, from, to, function(multiBal) {
							if(multiBal) {
								let fromBal = multiBal[from];
								let toBal = multiBal[to];
								if(type == "buy") {
									if(parseFloat(subTotal) > toBal) { return res.json({success:0, msg:"Insufficient Balance"}); }
									var upFrom = fromBal + amount;
									var upTo = toBal - parseFloat(subTotal);
								} else {
									if(amount > fromBal) { return res.json({success:0, msg:"Insufficient Balance"}); }
									var upFrom = fromBal - amount;
									var upTo = toBal + parseFloat(subTotal);
								}
								let swpObj = {
									user_id : mongoose.mongo.ObjectId(userId),
									from_symbol : from,
									to_symbol : to,
									amount : amount,
									price : price,
									type : type,
									fees : fees,
									fee_per : swpRes.swap_fee,
									total : total,
									status : "completed"
								};
								common.updateUserBalance(userId, from, upFrom, function(upRes) {
									if(upRes) {
										common.updateUserBalance(userId, to, upTo, function(upRes1) {
											if(upRes1) {
												swapOrder.create(swpObj, function(ordErr, ordRes) {
													if(ordRes) {
														let ordId = ordRes._id;
														var cliId = common.randomString(9) + new Date().getTime() + common.randomString(7);
														var params = { clientOid: cliId, side: type, symbol: trdPair, type: 'market', price: price, size: amount }
														if(type == "buy") {
															/*binLiq.marketBuy(selPair, amount, (binErr, binRes) => {
																if(binRes.orderId != "" && binRes.orderId != null && binRes.orderId != undefined) {
																	console.log('Binance swapBuy Order success:', ordId.toString());
																} else {
																	if(binErr.body != undefined) {
																		console.log("Binance swapBuy Order error:"+ordId.toString()+"->"+binErr.body);
																	} else {
																		console.log('Binance swapBuy Order error:',ordId.toString());
																	}
																}
															});*/
															kuws.placeOrder(params).then(kordRes=>{
																if(kordRes.code == '200000') {
																	if(kordRes.data.orderId != "" && kordRes.data.orderId != null && kordRes.data.orderId != undefined) {
																		console.log('Kucoin swapBuy Order success:', kordRes.data.orderId);
																	} else {
																		console.log('Kucoin swapBuy Order error:',kordRes);
																	}
																} else {
																	console.log('Kucoin swapBuy Order error:',kordRes);
																}
															});
														} else {
															/*binLiq.marketSell(selPair, amount, (binErr, binRes) => {
																if(binRes.orderId != "" && binRes.orderId != null && binRes.orderId != undefined) {
																	console.log('Binance swapSell Order success:', ordId.toString());
																} else {
																	if(binErr.body != undefined) {
																		console.log("Binance swapSell Order error:"+ordId.toString()+"->"+binErr.body);
																	} else {
																		console.log('Binance swapSell Order error:',ordId.toString());
																	}
																}
															});*/
															kuws.placeOrder(params).then(kordRes=>{
																if(kordRes.code == '200000') {
																	if(kordRes.data.orderId != "" && kordRes.data.orderId != null && kordRes.data.orderId != undefined) {
																		console.log('Kucoin swapSell Order success:', kordRes.data.orderId);
																	} else {
																		console.log('Kucoin swapSell Order error:',kordRes);
																	}
																} else {
																	console.log('Kucoin swapSell Order error:',kordRes);
																}
															});
														}
														let notObj = {user_id:userId, category:"Instant Swap Order", page:"swap", message:'Your Instant swap '+type+' order placed successfully for '+amount+' '+from+' with the price of '+price+' '+to};
														notify.create(notObj, function(notErr, notRes) {});
														res.json({success:1, msg:"Swap order placed successfully", from_bal:parseFloat(upFrom).toFixed(8), to_bal:parseFloat(upTo).toFixed(8)});
													} else {
														res.json({success:0, msg:"Failed to create swap order"});		
													}
												});
											} else {
												res.json({success:0, msg:"Failed to update balance"});
											}
										});
									} else {
										res.json({success:0, msg:"Failed to update balance"});
									}
								});
							} else {
								res.json({success:0, msg:"Failed to get balance"});
							}
						});
} else {
	return res.json({success:0, msg:"Please try again later"});
}
});

} else {
	res.json({success:0, msg:"Invalid request"});
}
});
} else {
	res.json({success:0, msg:"Place order after 2 seconds"});
}
});

router.post('/otcOrder', common.userVerify, (req,res) => {
	let info = req.body;
	if(validator.isEmpty(info.from)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.to)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.amount)) { return res.json({success:0, msg:"Enter Quantity"}); }
	if(validator.isEmpty(info.mprice)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.type)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.market_type)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.firstname)) { return res.json({success:0, msg:"Enter Firstname"}) }
		if(validator.isEmpty(info.lastname)) { return res.json({success:0, msg:"Enter Lastname"}) }
			if(validator.isEmpty(info.contact)) { return res.json({success:0, msg:"Enter Contact details"}) }
				if(validator.isEmpty(info.timezone)) { return res.json({success:0, msg:"Enter Timezone"}) }
					if(validator.isEmpty(info.note)) { return res.json({success:0, msg:"Enter Note"}) }
						if(validator.isEmpty(info.email)) { return res.json({success:0, msg:"Invalid request"}) }
							if(validator.isEmpty(info.user_type)) { return res.json({success:0, msg:"Select User type"}) }

								let userId = req.userId;
							let from = info.from;
							let to = info.to;
							let type = info.type;
							let mprice = info.mprice;
							let marType = info.market_type;
							let amount = parseFloat(info.amount);
							var usrTkn = usrListArr.indexOf(userId.toString());
							if(usrTkn == -1) {
								usrListArr.push(userId.toString());
								setTimeout(_swapMap._unsetUsrId, 2000, userId.toString());
								tradePairs.findOne({from_symbol:from, to_symbol:to, swap_status:1}, {_id:0, swap_min:1, swap_max:1, swap_fee:1, last_price:1, min_amt:1, decimal:1, amt_decimal:1}).exec(function(swpErr, swpRes) {
									if(swpRes) {
										let selPair = from + to;
										let feePer = parseFloat(swpRes.swap_fee);
										let minAmt = parseFloat(swpRes.min_amt);
										let deci = parseInt(swpRes.decimal);
										let amtdec = parseInt(swpRes.amt_decimal);
										if(amount < minAmt && marType == "amount") {
											return res.json({success:0, msg:"Enter amount more than "+minAmt});
										}
										// binLiq.prices(selPair, (error, ticPrc) => {
										let trdPair = from + '-' +to;
										kuws.getTicker(trdPair).then(ticker=>{
											// if(!error && ticPrc[selPair] != undefined) {
												if(ticker.code == '200000') {
												// let price = parseFloat(ticPrc[selPair]);
												let price = parseFloat(ticker.data.price);
												var total = (marType == "amount") ? amount * price : amount;
												var fees = (total * feePer) / 100;
												total = parseFloat(total).toFixed(8);
												fees = parseFloat(fees).toFixed(8);
												var subTotal = (type == "buy") ? total + fees : total - fees;
												if(parseFloat(subTotal) < swpRes.swap_min) {
													return res.json({success:0, msg:"Minimum order size is "+swpRes.swap_min+" "+to});
												}
												if(parseFloat(subTotal) > swpRes.swap_max) {
													return res.json({success:0, msg:"Maximum order size is "+swpRes.swap_max+" "+to});
												}
												if(marType == "total") {
													amount = amount / price;
													amount = amount.toFixed(amtdec);
													amount = parseFloat(amount);
												}
												common.multiBalance(userId, from, to, function(multiBal) {
													if(multiBal) {
														let fromBal = multiBal[from];
														let toBal = multiBal[to];
														if(type == "buy") {
									// if(parseFloat(subTotal) > toBal) { return res.json({success:0, msg:"Insufficient Balance"}); }
									// var upFrom = fromBal + amount;
									var upTo = toBal - parseFloat(subTotal);
									var upCur = to;
									var upBal = upTo;
								} else {
									// if(amount > fromBal) { return res.json({success:0, msg:"Insufficient Balance"}); }
									var upFrom = fromBal - amount;
									// var upTo = toBal + parseFloat(subTotal);
									var upCur = from;
									var upBal = upFrom;
								}
								let swpObj = {
									user_id : mongoose.mongo.ObjectId(userId),
									from_symbol : from,
									to_symbol : to,
									amount : amount,
									price : price,
									type : type,
									fees : fees,
									fee_per : swpRes.swap_fee,
									total : total,
									status : "pending",
									firstname : info.firstname,
									lastname : info.lastname,
									contact : info.contact,
									timezone : info.timezone,
									note : info.note,
									email : info.email,
									user_type : info.user_type,
								};
								// common.updateUserBalance(userId, upCur, upBal, function(upRes) {
									// if(upRes) {
										otcOrder.create(swpObj, function(ordErr, ordRes) {
											if(ordRes) {
												let ordId = ordRes._id;
												let notObj = {user_id:userId, category:"OTC Order", page:"otc", message:'Your OTC  order placed successfully for '+amount+' '+from+' with the price of '+price+' '+to};
												notify.create(notObj, function(notErr, notRes) {});
												res.json({success:1, msg:"OTC order placed successfully", from_bal:parseFloat(upFrom).toFixed(8), to_bal:parseFloat(upTo).toFixed(8)});
											} else {
												res.json({success:0, msg:"Failed to create OTC order"});		
											}
										});
									// } else {
									// 	res.json({success:0, msg:"Failed to update balance"});
									// }
								// });
							} else {
								res.json({success:0, msg:"Failed to get balance"});
							}
						});
											} else {
												return res.json({success:0, msg:"Please try again later"});
											}
										});

									} else {
										res.json({success:0, msg:"Invalid request"});
									}
								});
							} else {
								res.json({success:0, msg:"Place order after 2 seconds"});
							}
						});

router.get('/portfolio', common.userVerify, (req,res) => {
	let userId = req.userId;
	let validUser = validator.isMongoId(userId);
	if(!validUser) { return res.json({success:0, msg:"Invalid request"}); }
	wallet.findOne({user_id:userId}, {_id:0, wallet:1}).exec(function(walErr, walRes) {
		var eqVal = {"btc":"0.00", "usdt":"0.00"};
		nonZeroBal(walRes, function(balRes) {
			let currs = balRes.currs;
			let balArr = balRes.balArr;
			if(currs.length > 0) {
				tradePairs.find({from_symbol:{$in:currs}, to_symbol:"USDT"}, {_id:0, from_symbol:1, last_price:1}).exec(function(curErr, curRes) {
					calcBalance(curRes, balArr, function(totBal) {
						totBal = parseFloat(totBal);
						if(totBal > 0) {
							tradePairs.findOne({from_symbol:"BTC", to_symbol:"USDT"}, {_id:0, last_price:1}).exec(function(pairErr, pairRes) {
								let btc = totBal / pairRes.last_price;
								eqVal = {"btc":btc.toFixed(8), "usdt":totBal.toFixed(2)};
								res.json({success:1, value:eqVal});
							});
						} else {
							res.json({success:1, value:eqVal});
						}
					})
				});
			} else {
				res.json({success:1, value:eqVal});
			}
		});
	});
});

function calcBalance(currs, wallet, cb) {
	var i = 1; var len = currs.length;
	var totBal = (wallet['USDT'] != undefined) ? wallet['USDT'] : 0;
	if(currs.length > 0) {
		currs.forEach((curr) => {
			let sym = curr.from_symbol;
			let rate = curr.last_price;
			var bal = (wallet[sym] != undefined) ? wallet[sym] : 0;
			bal = bal * rate;
			totBal += bal;
			if(i == len) { cb(totBal.toFixed(2)); }
			i = i + 1;
		});
	} else {
		cb(totBal.toFixed(2));
	}
}

function nonZeroBal( bals, cb) {
	let balRes = {}; balCurr = [];
	var currs = bals.wallet;
	let walRes = currs.filter(item => item.amount > 0);
	var i = 1; var len = walRes.length;
	if(len > 0) {
		walRes.forEach((curr) => {
			balRes[curr.currency] = curr.amount;
			balCurr.push(curr.currency);
			if(i == len) { cb({balArr:balRes, currs:balCurr}); }
			i = i + 1;
		});
	} else {
		cb({balArr:balRes, currs:balCurr});
	}
}

router.get('/getCurrency', common.userVerify, (req,res) => {
	let userId = req.userId;
	let validUser = validator.isMongoId(userId);
	if(!validUser) { return res.json({success:0, msg:"Invalid request"}); }
	async.parallel({
		currRes:function(cb) {
			currency.find({status:1, type:{$ne:'fiat'}}, {_id:0, symbol:1, name:1, image:1, usd_price: 1}).sort({symbol: 1}).exec(cb)
		},
		userWallet:function(cb) {
			wallet.findOne({"user_id":userId}, {wallet:1}).exec(cb)
		},
		ordRes:function(cb) {
			orderDb.aggregate([{
				$facet: {
					"buyRes" : [
					{ $lookup : { from:'ordertemp', localField:'_id', foreignField:'buyorderId', as:'OT' } },
					{ $match : { user_id:mongoose.mongo.ObjectId(userId), Type:'buy', status: {$in:['active', 'partially', 'stoplimit']} } },
					{ $project : { secondCurrency:'$secondCurrency', Total:'$Total', filledTotal:{ $sum:'$OT.total' } } },
					{ $group : { _id:'$secondCurrency', Total:{ $sum:'$Total' }, filledTotal:{ $sum:'$filledTotal' } } },
					],
					"sellRes" : [
					{ $lookup : { from:'ordertemp', localField:'_id', foreignField:'sellorderId', as:'OT' } },
					{ $match : { user_id:mongoose.mongo.ObjectId(userId), Type:'sell', status: {$in:['active', 'partially', 'stoplimit']} } },
					{ $project : { firstCurrency:'$firstCurrency', Amount:'$Amount', filledAmount:{ $sum:'$OT.filledAmount' } } },
					{ $group : { _id:'$firstCurrency', Amount:{ $sum:'$Amount' }, filledAmount:{ $sum:'$filledAmount' } } },
					],
				}
			}]).exec(cb)
		},
		p2pordRes:function(cbb) {
			p2porderDb.aggregate([{
				$facet: {
					"buyRes" : [
					{ $lookup : { from:'p2p_ordertemp', localField:'_id', foreignField:'buyorderId', as:'OT' } },
					{ $match : { user_id:mongoose.mongo.ObjectId(userId), Type:'buy', status: {$in:['active', 'partially']} } },
					{ $project : { secondCurrency:'$secondCurrency', Total:'$Total', filledTotal:{ $sum:'$OT.total' } } },
					{ $group : { _id:'$secondCurrency', Total:{ $sum:'$Total' }, filledTotal:{ $sum:'$filledTotal' } } },
					],
					"sellRes" : [
					{ $lookup : { from:'p2p_ordertemp', localField:'_id', foreignField:'sellorderId', as:'OT' } },
					{ $match : { user_id:mongoose.mongo.ObjectId(userId), Type:'sell', status: {$in:['active', 'partially']} } },
					{ $project : { firstCurrency:'$firstCurrency', Amount:'$Amount', filledAmount:{ $sum:'$OT.filledAmount' } } },
					{ $group : { _id:'$firstCurrency', Amount:{ $sum:'$Amount' }, filledAmount:{ $sum:'$filledAmount' } } },
					],
				}
			}]).exec(cbb)
		},
	}, function(err, result) {
		if(result) {
			if(result.userWallet) {
				if(result.userWallet.wallet && result.userWallet.wallet.length > 0) {
					var walBal = [];
					for (var i = 0; i < result.userWallet.wallet.length; i++) {
						walBal[result.userWallet.wallet[i].currency] = result.userWallet.wallet[i];
					}
					formatResponse(walBal, result.currRes, result.ordRes, result.p2pordRes, function(resp) {
						res.json({success:1, result:resp});
					})
				} else {
					res.json({success:0, msg:"Invalid request"});
				}
			} else {
				res.json({success:0, msg:"Invalid request"});
			}
		} else {
			res.json({success:0, msg:"Something went wrong"});
		}
	});
});

function formatResponse(wallet, currs, ordRes, p2pordRes, cb) {
	var balArr; var currBals = []; var i = 1; var len = currs.length;
	let buyRes = ordRes[0].buyRes; let sellRes = ordRes[0].sellRes;
	let p2pbuyRes = p2pordRes[0].buyRes; let p2psellRes = p2pordRes[0].sellRes;
	currs.forEach((curr) => {
		let sym = curr.symbol;
		tradePairs.findOne({from_symbol:sym, to_symbol:"USDT"}, {_id:0, last_price:1}).exec(function(curErr, tradePairs) {
			if(tradePairs) {
				usdPrice = (sym == 'USDT') ? 1 : tradePairs.last_price;
			} else {
				usdPrice = (sym == 'USDT') ? 1 : curr.usd_price;
			}
			var inOrd = 0;
			let buyOrd = buyRes.filter(item => item._id == sym);
			if(buyOrd.length > 0) {
				var tot = parseFloat(buyOrd[0].Total) - parseFloat(buyOrd[0].filledTotal);
				inOrd += tot;
			}
			let sellOrd = sellRes.filter(item => item._id == sym);
			if(sellOrd.length > 0) {
				var amt = parseFloat(sellOrd[0].Amount) - parseFloat(sellOrd[0].filledAmount);
				inOrd += amt;
			}
			let p2pbuyOrd = p2pbuyRes.filter(item => item._id == sym);
			if(p2pbuyOrd.length > 0) {
				var tot = parseFloat(p2pbuyOrd[0].Total) - parseFloat(p2pbuyOrd[0].filledTotal);
				inOrd += tot;
			}
			let p2psellOrd = p2psellRes.filter(item => item._id == sym);
			if(p2psellOrd.length > 0) {
				var amt = parseFloat(p2psellOrd[0].Amount) - parseFloat(p2psellOrd[0].filledAmount);
				inOrd += amt;
			}
			if(inOrd > 0) { inOrd = parseFloat(inOrd).toFixed(8); }
			let bal = (wallet[sym] != undefined) ? wallet[sym].amount : 0;
			let allbal = parseFloat(bal) + parseFloat(inOrd);
			let usdVal = parseFloat(allbal) * parseFloat(usdPrice);
			balArr = { "symbol":sym, "name":curr.name, "image":curr.image, "balance":allbal, "order":inOrd, "usdVal":usdVal };
			currBals.push(balArr);
			if(i == len) { cb(currBals); }
			i = i + 1;
		});
	});
}

module.exports = router;