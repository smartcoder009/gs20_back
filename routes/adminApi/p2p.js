const express = require('express');
const router = express.Router();
const async = require('async');
const mongoose = require('mongoose');
const moment = require('moment');

const encdec = require('../../helpers/newendecryption');
const common = require('../../helpers/common');
const p2pHlp = require('../../helpers/p2p');
const mail = require('../../helpers/mail');

const users = require('../../model/users');
const orderDb = require('../../model/p2pCoinOrder');
const tempDb = require('../../model/p2pOrdertemp');
const pairsDb = require('../../model/p2pPairs');
const disputeDb = require('../../model/p2pDispute');
const escrowDb = require('../../model/p2pEscrow');

let updatedDate = () => { return new Date(); };

//get open orders
router.post('/openOrders', common.tokenMiddleware, function(req, res, next) {
	var userRes = {};	var srt = {};
	var info = req.body;
	var search = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var size = parseInt(info.pageSize);
	var sortName = info.sortActive;
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var skip = size * pageNo;
	// search
	var cnt = {status: { $in:['active', 'partially']}}
	if(search != ""){
		var newDate = ""; var newDate1 = "";
		if(moment(new Date(search), "YYYY-MM-DD h:mm:ss").isValid()) {
			var searchDate = new Date(search);
			var srdate = new Date(search);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() - 1 );
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();
		}
		cnt['$or'] = [{'users.username': { $regex: '.*' + search + '.*',$options: 'i' }}, {'user_bank.acc_number': { $regex: '.*' + search + '.*',$options: 'i' }}, {'user_bank.bank_name': { $regex: '.*' + search + '.*',$options: 'i' }}, {'Type': { $regex: '.*' + search + '.*',$options: 'i' }}, {'status': { $regex: '.*' + search + '.*',$options: 'i' }}, {'firstCurrency': { $regex: '.*' + search + '.*',$options: 'i' }},{'secondCurrency': { $regex: '.*' + search + '.*',$options: 'i' }}];
		search = parseFloat(search);
		if(search >= 0){
			if((newDate) && (newDate1)) {
				cnt['$or'].push({'Amount': { $eq: parseFloat(search)}}, {'Price': { $eq: parseFloat(search)}}, {'Total': { $eq: parseFloat(search)}}, {'created_at': { $gt: new Date(newDate), $lte: new Date(newDate1)}})
			} else {
				cnt['$or'].push({'Amount': { $eq: parseFloat(search)}}, {'Price': { $eq: parseFloat(search)}}, {'Total': { $eq: parseFloat(search)}})
			}
		}
	}

	var start = "";
	if(info.startDate != '') {
		if(moment(new Date(info.startDate), "YYYY-MM-DD h:mm:ss").isValid()) {
			var startDate = new Date(info.startDate);
			startDate.setDate(startDate.getDate() + 1 );
			start = startDate.toISOString();
		}
	}
	var end = "";
	if(info.endDate != '') {
		if(moment(new Date(info.endDate), "YYYY-MM-DD h:mm:ss").isValid()) {
			var endDate = new Date(info.endDate);
			endDate.setDate(endDate.getDate() + 1 );
			end = endDate.toISOString();
		}
	}

	if(start != '' && end != '') {
		cnt['$or'] = [{'created_at': { $gte:  new Date(start), $lt:  new Date(end)}}];
	}
	
	async.parallel({
		orderData :function (cb){
			orderDb.aggregate([
				{ $lookup: {
					from: "user_info",
					localField: "user_id",
					foreignField: "_id",
					as: "users"
				}},		
				{ $lookup: {
					from: "user_bank",
					localField: "user_id",
					foreignField: "user_id",
					as: "user_bank"
				}},			
				{$match: cnt},
				{
					$project : {
						_id : 1,						
						"from":"$firstCurrency",
						"to":"$secondCurrency",
						"Amount": "$Amount",
						"Price": "$Price",
						"Type": "$Type",
						"status" : "$status",
						"created_at": "$created_at",
						"username": {$arrayElemAt:["$users.username",0]},
						"useracc": {$arrayElemAt:["$user_bank.acc_number",0]},
						"bankname": {$arrayElemAt:["$user_bank.bank_name",0]}
					}
				},
				{ "$sort": srt },
				{ "$skip": skip },
				{ "$limit": size }
				]).exec(cb) 
		},
	},function(err,results){
		if (err) { return res.status(500).send(err); }
		formatOrderHist(results.orderData, function(openRes) {
			res.json({status:true, data:openRes, activeCount:results.orderData.length});
		});
	});
});

function formatOrderHist(open, callback) {
	if(open.length > 0) {
		var opens = [];
		var openArr; var i = 1; var len = open.length;
		open.forEach((val) => {
			var type = val.Type.charAt(0).toUpperCase()+val.Type.slice(1);
			var price = val.Price;
			var amount = val.Amount;
			var feePer = val.fee_per;
			var ctime = val.created_at;
			var status = val.status;
			var bankname = val.bankname;
			var useracc = val.useracc;
			checkOrderTemp(status, type, val._id, function(filled) {
				var filledAmt = parseFloat(amount) - parseFloat(filled);
				var total = filledAmt * price;
				openArr = {'created_at':ctime, 'Type':type, 'Amount':filledAmt.toFixed(8), 'Price':price.toFixed(8), 'Total':total.toFixed(8), 'pairs':val.from +'/'+ val.to, 'username':val.username, 'status':status, 'bankname': bankname, 'useracc': useracc};
				opens.push(openArr);
				if(i == len) { callback(opens); }
				i = i + 1;
			})
		});
	} else {
		callback([]);
	}
}

function checkOrderTemp(status, type, orderId, callback) {
	if(status == "partially") {
		let matchCase = (type == 'Buy') ? { buyorderId: orderId } : { sellorderId: orderId };
		tempDb.aggregate([
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

//get filled history
router.post('/filledhistory', common.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	var search = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var sortName = info.sortActive;
	var srt = {}; var cnt;
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var size = (info.export_hist == 1) ? 10000 : parseInt(info.pageSize);
	var skip = size * pageNo;
	// search
	if(search != "") {
		var newDate = ""; var newDate1 = "";
		if(moment(new Date(search), "YYYY-MM-DD h:mm").isValid()) {
			var searchDate = new Date(search);
			var srdate = new Date(search);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();
		}
		cnt = { cancel_id:null, $or:[{'buyuser.username': { $regex: '.*' + search + '.*',$options: 'i' }}, {'selluser.username': { $regex: '.*' + search + '.*',$options: 'i' }}, {'pair': { $regex: '.*' + search + '.*',$options: 'i' }} ]};
		search = parseFloat(search);
		if(search >= 0) {
			if((newDate) && (newDate1)) {
				cnt['$or'].push({'askPrice': { $eq: parseFloat(search)}}, {'filledAmount': { $eq: parseFloat(search)}}, {'total': { $eq: parseFloat(search)}}, {'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}})
			} else {
				cnt['$or'].push({'askPrice': { $eq: parseFloat(search)}}, {'filledAmount': { $eq: parseFloat(search)}}, {'total': { $eq: parseFloat(search)}})
			}
		}
	} else {
		cnt = { cancel_id:null };
	}
	async.parallel({
		tempData :function (cb){
			tempDb.aggregate([
			{
				$lookup: {
					from: "user_info",
					localField: "buyerUserId",
					foreignField: "_id",
					as: "buyuser"
				}
			},
			{
				$lookup: {
					from: "user_info",
					localField: "sellerUserId",
					foreignField: "_id",
					as: "selluser"
				}
			},
			{"$match": cnt},
			{
				$project : {
					_id : 1,
					"filledAmount": "$filledAmount",
					"askPrice": "$askPrice",
					"total": "$total",
					"created_at": "$created_at",
					"cancel_id":"$cancel_id",
					"buyername": {$arrayElemAt:["$buyuser.username",0]},
					"sellername": {$arrayElemAt:["$selluser.username",0]},
					"pairname": "$pair"
				}
			},
			{ "$sort": srt },
			{ "$skip": skip },
			{ "$limit": size }
			]).exec(cb) 
		},
	},function(err,results){
		if (err) {return res.status(500).send(err);}
		res.json({status:true, data:results.tempData, filledCount:results.tempData.length});
	})
});

// get pairs data
router.get('/p2pPairs', common.tokenMiddleware, (req,res) => {
	pairsDb.find({}, {from_symbol:1, to_symbol:1, last_price:1, status:1, created_at:1}).exec(function(error,resData) {
		if (error) { return next(error); }
		res.json({status:true, data:resData });
	})
});

router.get('/editPair/:id', (req,res) => {
	var id = req.params.id;	
	pairsDb.findOne({"_id": id}, {from_symbol:1, to_symbol:1, min_amt:1, max_amt:1, min_price:1, max_price:1, amt_decimal:1, decimal:1}).exec(function(er, res1) {
		if (er) { return next(er); }
		if(res1){
			let resp = {_id:res1._id, pair:res1.from_symbol+'/'+res1.to_symbol, min_price:res1.min_price, max_price:res1.max_price, min_amt:res1.min_amt, max_amt:res1.max_amt, amt_decimal:res1.amt_decimal, decimal:res1.decimal};
			res.json({status:true, data:resp});
		}
	})
});

router.post('/pairStatus', common.tokenMiddleware, (req,res) => {
	let info = req.body;
	let sts = (info.status == 1) ? 0 : 1;
	let obj = { "status":sts, "created_at":updatedDate() };
	selPair = info.pair;
	pairsDb.findOneAndUpdate({"_id":info._id}, {"$set":obj}, {multi: true}).exec(function(err, resUpdate) {
		if(resUpdate) {
			res.json({status:true, msg:"Successfully updated"});
		} else {
			res.json({status:false, msg:"Invalid request. Please try again"});
		}
	});
});

router.post('/pairUpdate', common.tokenMiddleware, (req,res) => {
	let info = req.body;
	let obj = { "min_price":parseFloat(info.min_price), "max_price":parseFloat(info.max_price), "decimal":parseInt(info.decimal), "amt_decimal":parseInt(info.amt_decimal), "min_amt":parseFloat(info.min_amt), "max_amt":parseFloat(info.max_amt), "created_at":updatedDate() };
	pairsDb.updateOne({"_id":info._id}, {"$set":obj}).exec(function(err, resUpdate) {
		if(resUpdate) {
			res.json({status:true, msg:"Successfully updated"});
		} else {
			res.json({status:false, msg:"Invalid request. Please Try again"});
		}
	});
});

//get dispute list
router.post('/disputelist', common.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	var search = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var sortName = info.sortActive;
	var srt = {}; var cnt;
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var size = (info.export_hist == 1) ? 10000 : parseInt(info.pageSize);
	var skip = size * pageNo;
	// search
	if(search != "") {
		var newDate = ""; var newDate1 = "";
		if(moment(new Date(search), "YYYY-MM-DD h:mm").isValid()) {
			var searchDate = new Date(search);
			var srdate = new Date(search);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();
		}
		cnt = { $or:[{'buyuser.username': { $regex: '.*' + search + '.*',$options: 'i' }}, {'selluser.username': { $regex: '.*' + search + '.*',$options: 'i' }}, {'pair': { $regex: '.*' + search + '.*',$options: 'i' }} ]};
		search = parseFloat(search);
		if(search >= 0) {
			if((newDate) && (newDate1)) {
				cnt['$or'].push({'price': { $eq: parseFloat(search)}}, {'amount': { $eq: parseFloat(search)}}, {'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}})
			} else {
				cnt['$or'].push({'price': { $eq: parseFloat(search)}}, {'amount': { $eq: parseFloat(search)}})
			}
		}
	} else {
		cnt = {};
	}
	async.parallel({
		disputeData :function (cb){
			disputeDb.aggregate([
			{
				$lookup: {
					from: "user_info",
					localField: "buyerUserId",
					foreignField: "_id",
					as: "buyuser"
				}
			},
			{
				$lookup: {
					from: "user_info",
					localField: "sellerUserId",
					foreignField: "_id",
					as: "selluser"
				}
			},
			{"$match": cnt},
			{
				$project : {
					_id : 1,
					"amount": "$amount",
					"price": "$price",
					"status": "$status",
					"created_at": "$created_at",
					"buyername": {$arrayElemAt:["$buyuser.username",0]},
					"sellername": {$arrayElemAt:["$selluser.username",0]},
					"pair": "$pair"
				}
			},
			{ "$sort": srt },
			{ "$skip": skip },
			{ "$limit": size }
			]).exec(cb) 
		},
	},function(err,results){
		if (err) {return res.status(500).send(err);}
		res.json({status:true, data:results.disputeData, disputeCount:results.disputeData.length});
	})
});

//To view particular dispute info
router.get('/viewDispute/:id', (req, res) => {
	let id = req.params.id;	
	disputeDb.findOne({_id:id}).exec(function(err1, res1) {
		if(res1) {
			users.findOne({_id:res1.buyerUserId}, {_id:0, username:1}).exec(function(buyErr, buyRes) {
				users.findOne({_id:res1.sellerUserId}, {_id:0, username:1}).exec(function(sellErr, sellRes) {
					let resp = {_id:res1._id, pair:res1.from_symbol+'/'+res1.to_symbol, buyUser:buyRes.username, sellUser:sellRes.username, buyOrd:res1.buy_order, sellOrd:res1.sell_order, buy_status:res1.buy_status, sell_status:res1.sell_status, status:res1.status, amount:res1.amount, price:res1.price, remarks:res1.remarks, proof:res1.proof };
					res.json({status:true, data:resp});
				});
			});
		} else {
			res.json({status:false});
		}
	})
});

//To approve dispute
router.post('/approveDispute', common.tokenMiddleware, (req,res) => {
	let info = req.body;
	if(info.token == undefined || info.token == "" || info.token == null) {
		return res.json({status:false, msg:"Invalid request"});
	}
	let id = mongoose.mongo.ObjectId(info.token);

	disputeDb.findOne({_id:id}, {buyorderId:1, sellorderId:1, buyerUserId:1, sellerUserId:1, buy_order:1, sell_order:1, from_symbol:1, to_symbol:1, amount:1, price:1}).exec(function(err1, res1) {
		if(res1) {
			let orderId = res1.buyorderId;
			let userId = res1.buyerUserId;
			let first = res1.from_symbol;
			let second = res1.to_symbol;
			let buyOrd = res1.buy_order;
			let matchId = res1.sellorderId;
			let matchUser = res1.sellerUserId;
			let sellOrd = res1.sell_order;
			let amount = res1.amount;
			let price = res1.price;
			var total = amount * price;
			total = total.toFixed(8);

			escrowDb.findOne({sellorderId:matchId, buyorderId:orderId}, {_id:1, amount:1, currency:1}).exec(function(escErr, escRes) {
				if(escRes) {
					let curr = escRes.currency;
					let amt = escRes.amount;
					let tempJson = {
						sellorderId: matchId, sellerUserId: mongoose.mongo.ObjectId(matchUser), askAmount: amount, askPrice: price, firstCurrency: first, secondCurrency: second, filledAmount: amount, buyorderId: orderId, buyerUserId: userId, buy_fee: 0, sell_fee: 0, total: parseFloat(total), pair: first+'_'+second, buy_order:buyOrd, sell_order:sellOrd
					};
					tempDb.create(tempJson, function(tempErr, tempRes) {
						if(tempRes) {
							orderDb.updateMany({_id:{$in:[orderId, matchId]}}, {"$set":{confirmtime:new Date(), pagestatus:"completed", status:"completed", confirm_status:1}}).exec(function(upErr1, upRes1) {
								if(upRes1) {
									pairsDb.updateOne({from_symbol:first, to_symbol:second}, {"$set":{last_price:price}}).exec(function(pairErr, pairRes) {});
									escrowDb.updateOne({_id:escRes._id}, {"$set":{sell_status:"paid"}}).exec(function(upErr2, upRes2) {
										common.findUserBalance(userId, curr, function(fBalance) {
											fBalance = parseFloat(fBalance);
											var upBal = fBalance + amt;
											common.updateUserBalance(userId, curr, upBal, function(callRes) {
												if(callRes) {
													disputeDb.updateOne({_id:id}, {"$set":{status:1, updated_at:new Date()}}).exec(function(upErr, upRes) {
														p2pHlp.p2pOrderUpdate(buyOrd);
														p2pHlp.p2pOrderUpdate(sellOrd);
														disputeMail(userId, matchUser, 'approve');
														console.log({"userid":userId, "currency":curr, "exist":fBalance, "new":upBal, "id":orderId.toString(), "type":"P2P Order Match", "time":new Date()});
														res.json({status:true, msg:"Order approved successfully"});
													});
												} else {
													res.json({status:false, msg:"Failed to update balance"});
												}
											});
										});
									});
								} else {
									res.json({status:false, msg:"Failed to update order"});
								}
							});
						} else {
							res.json({status:false, msg:"Failed to update order"});
						}
					});
				} else {
					res.json({status:false, msg:"Invalid request"});
				}
			});
		} else {
			res.json({status:false, msg:"Invalid request"});
		}
	});
});

//To reject dispute
router.post('/rejectDispute', common.tokenMiddleware, (req,res) => {
	let info = req.body;
	if(info.token == undefined || info.token == "" || info.token == null) {
		return res.json({status:false, msg:"Invalid request"});
	}
	let id = mongoose.mongo.ObjectId(info.token);

	disputeDb.findOne({_id:id}, {buyorderId:1, sellorderId:1, buyerUserId:1, sellerUserId:1, buy_order:1, sell_order:1, from_symbol:1, to_symbol:1, amount:1, price:1}).exec(function(err1, res1) {
		if(res1) {
			let orderId = res1.buyorderId;
			let userId = res1.buyerUserId;
			let first = res1.from_symbol;
			let second = res1.to_symbol;
			let buyOrd = res1.buy_order;
			let matchId = res1.sellorderId;
			let matchUser = res1.sellerUserId;
			let sellOrd = res1.sell_order;
			let amount = res1.amount;
			let price = res1.price;

			let orderJson = {
				askAmount: amount, askPrice: price, firstCurrency: first, secondCurrency: second, filledAmount: amount, total: 0, buy_fee: 0, sell_fee: 0, cancel_id: userId, pair: first+'_'+second, sellorderId: mongoose.mongo.ObjectId(0), sellerUserId: mongoose.mongo.ObjectId(0), buyorderId: orderId, buyerUserId: userId, cancel_order: "buy", buy_order: buyOrd
			};
			tempDb.create(orderJson, function(insErr, insRes) {
				if(insRes) {
					orderDb.updateOne({_id:orderId}, {"$set":{status:'cancelled', pagestatus:'cancel', cancel_status:1, updated_at:new Date()}}).exec(function(upErr,upRes) {
						if(upRes) {
							p2pHlp.p2pUserEmit({token:encdec.encryptNew(userId.toString()), from:first, to:second});
							p2pHlp.checkCancelOrdertemp("sell", matchId, function(fillAmt) {
								let filled = amount - parseFloat(fillAmt);
								let orderJson1 = {
									askAmount: amount, askPrice: price, firstCurrency: first, secondCurrency: second, filledAmount: parseFloat(filled).toFixed(8), total: 0, buy_fee: 0, sell_fee: 0, cancel_id: matchUser, pair: first+'_'+second, sellorderId: matchId, sellerUserId: matchUser, buyorderId: mongoose.mongo.ObjectId(0), buyerUserId: mongoose.mongo.ObjectId(0), cancel_order: "sell", sell_order: sellOrd
								};
								common.findUserBalance(matchUser, first, function(balRes) {
									var balance = parseFloat(balRes);
									var upBal = balance + parseFloat(filled);
									upBal = parseFloat(upBal).toFixed(8);
									tempDb.create(orderJson1, function(insErr1, insRes1) {
										if(insRes1) {
											orderDb.updateOne({_id:matchId}, {"$set":{status:'cancelled', pagestatus:'cancel', cancel_status:1, updated_at:new Date()}}).exec(function(upErr,upRes) {
												if(upRes) {
													common.updateUserBalance(matchUser, first, upBal, function(upRes) {
														disputeDb.updateOne({_id:id}, {"$set":{status:2, updated_at:new Date()}}).exec(function(upErr2, upRes2) {
															console.log({"userid":matchUser.toString(), "currency":first, "exist":balance, "new":upBal, "id":matchId.toString(), "type":"P2P Order Cancel", "time":new Date()});
															p2pHlp.p2pPairEmit({userId:matchUser.toString(), from:first, to:second});
															p2pHlp.p2pOrderUpdate(buyOrd);
															p2pHlp.p2pOrderUpdate(sellOrd);
															disputeMail(userId, matchUser, 'disapprove');
															res.json({status:true, msg:"Order rejected successfully"});
														});
													});
												} else {
													res.json({status:false, msg:"Failed to update sell order"});
												}
											})
										} else {
											res.json({status:false, msg:"Failed to update sell order"});
										}
									})
								});
							});
						} else {
							res.json({status:false, msg:"Failed to update buy order"});
						}
					});
				} else {
					res.json({status:false, msg:"Failed to update buy order"});
				}
			});
		} else {
			res.json({status:false, msg:"Invalid request"});
		}
	});
});

function disputeMail(buyuserId, selluserId, type) {
	users.find({ _id:{$in:[mongoose.mongo.ObjectId(buyuserId),mongoose.mongo.ObjectId(selluserId)]}}, {_id: 1, primary_value:1, added_val:1, username:1}).exec(function(userErr, userRes) {
		if (userErr) { return false; }
		if(userRes) {
			let buyUser = userRes.filter(item => item._id.toString() == buyuserId.toString());
			let sellUser = userRes.filter(item => item._id.toString() == selluserId.toString());

			if(type == 'approve') {
				var buyerType = 'approve'; var sellerType = 'disapprove';
			} else {
				var buyerType = 'disapprove'; var sellerType = 'approve';
			}

			let buySpecialVars = { '###USER###': buyUser[0].username, '###MATCHUSER###': sellUser[0].username, '###TYPE###': buyerType};
			let buyUsermail = encdec.decryptNew(buyUser[0].primary_value) + encdec.decryptNew(buyUser[0].added_val);

			let sellSpecialVars = { '###USER###': sellUser[0].username, '###MATCHUSER###': buyUser[0].username, '###TYPE###': sellerType};
			let sellUsermail = encdec.decryptNew(sellUser[0].primary_value) + encdec.decryptNew(sellUser[0].added_val);

			mail.sendMail(buyUsermail, 'dispute_resolution', buySpecialVars, function(mailRes) { });
			mail.sendMail(sellUsermail, 'dispute_resolution', sellSpecialVars, function(mailRes) { });
			return true;
		} else {
			return false;
		}
	})
}
module.exports = router;