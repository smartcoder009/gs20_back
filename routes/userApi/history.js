const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const helpingLib = require('../../helpers/common');
const encdec = require('../../helpers/newendecryption');
const async = require('async');

//schemas load
const deposit  = require('../../model/deposit');
const withdraw = require('../../model/withdraw');
const users   = require('../../model/users');
const userhistory   = require('../../model/userhistory');
const notify   = require('../../model/notify');
const referral   = require('../../model/referral');
const pairDB = require('../../model/pairs');
const currencyDB = require('../../model/currency');
const mapDb = require('../../model/mapping');
const swapOrder = require('../../model/swapOrder');
const otcOrder = require('../../model/otcOrder');
const p2pmapDb = require('../../model/p2pOrdertemp');

let apiresponse = { status: 200, message: "", data: [] };

router.get('/pair_fee', (req, res) => {
	try {
		pairDB.find({status:1},{from_symbol:1,to_symbol:1,trade_fee:1,min_amt:1}).exec(function(err, resData) {
			var resp = [];
			for(var i=0; i<resData.length; i++) {
				var datas = {};
				var info = resData[i];
				datas['market'] = info.from_symbol+"/"+info.to_symbol;
				datas['trade_fee'] = info.trade_fee;
				datas['min_amt'] = info.min_amt;
				resp.push(datas);
			}
			res.json({success:1, data:resp})
		})
	} catch(e) {
		res.json({success:0});
	}
})

router.get('/withdraw_fee', (req, res) => {
	try {
		currencyDB.find({status:1, type:{$ne:'fiat'}}, {name:1, symbol:1, min_withdraw:1, max_withdraw:1,withdraw_fee:1}).sort({order_id:1}).exec(function(err, resData) {
			res.json({success:1, data:resData})
		})
	} catch(e) {
		res.json({success:0});
	}
})

router.post('/tradeNotify', helpingLib.tokenMiddleware, (req, res) => {
	try{
		let userId  = req.userId;
		var skip  = req.body.limit * req.body.size;
		var limit = req.body.size;
		var gets = {}
		var search = req.body.search;
		var where = {"user_id": userId}
		async.parallel({
			myHistory:function(cb){
				mapDb.find({ $or: [{buyerUserId: mongoose.mongo.ObjectId(userId)}, {sellerUserId: mongoose.mongo.ObjectId(userId)}] }, {_id:0, sellerUserId:1, buyerUserId:1, askPrice:1, filledAmount:1, cancel_id:1, created_at:1, buy_fee:1, sell_fee:1, pair:1}).sort({created_at: -1}).exec(cb)
			}
		},function(err, results){
			if (err) return res.status(500).send(err);
			let trade = results.myHistory;
			formatMyTrade(userId, trade, function(myRes) {
				res.send({status:true, data:myRes});
			});
		});
	} catch(e){
		console.log("tradehistory",e);
	}
})

function formatMyTrade(userId, trade, callback) {
	if(trade.length > 0) {
		hists = [];
		let histArr; let i = 1; let len = trade.length;
		trade.forEach((val) => {
			let sellUser = val.sellerUserId.toString();
			let buyUser = val.buyerUserId.toString();
			let amount = val.filledAmount;
			let price = val.askPrice;
			let pair = val.pair.replace('_', '/');
			let type = (buyUser == userId) ? "Buy" : "Sell";
			let total = amount * price;
			let status = (val.cancel_id != null) ? "Cancelled" : "Filled";
			let clsName = (status == "Filled") ? "text-success" : "text-danger";
			let tclsName = (type == "Buy") ? "text-success":"text-danger";
			let fees = (type == "Buy") ? val.buy_fee : val.sell_fee;
			histArr = {'ctime':val.created_at, 'type':type, 'amount':amount.toFixed(8), 'price':price.toFixed(8), 'total':total.toFixed(8), 'fees':fees, 'status':status, 'pair':pair, 'scls':clsName, 'tcls':tclsName};
			hists.push(histArr);
			if(i == len) { callback(hists); }
			i = i + 1;
		})
	} else {
		callback([]);
	}
}

router.post('/p2ptradeNotify', helpingLib.tokenMiddleware, (req, res) => {
	try{
		let userId  = req.userId;
		var skip  = req.body.limit * req.body.size;
		var limit = req.body.size;
		var gets = {}
		var search = req.body.search;
		var where = {"user_id": userId}
		async.parallel({
			myHistory:function(cb){
				p2pmapDb.find({ $or: [{buyerUserId: mongoose.mongo.ObjectId(userId)}, {sellerUserId: mongoose.mongo.ObjectId(userId)}] }, {pair:1, buyerUserId:1, sellerUserId:1, askPrice:1, filledAmount:1, cancel_id:1, created_at:1, buy_fee:1, sell_fee:1}).sort({created_at: -1}).sort({created_at: -1}).exec(cb)
			}
		},function(err, results){
			if (err) return res.status(500).send(err);
			let trade = results.myHistory;
			formatMyTrade(userId, trade, function(myRes) {
				res.send({status:true, data:myRes});
			});
		});
	} catch(e){
		console.log("p2ptradehistory",e);
	}
})

router.post('/depositNotify', helpingLib.tokenMiddleware, (req, res) => {
	try {
		let userId  = req.userId;
		async.parallel({
			usersData:function(cb){
				deposit.find({"user_id": userId}, {_id:0, currency:1, payment_type:1, amount:1, reference_no:1, created_at:1, status:1}).sort({created_at : -1}).exec(cb);
			}
		},function(err,results){
			if (err) return res.status(500).send(err);
			res.send({status:true, data:results.usersData});
		});
	} catch(e){
		console.log("deposithistory",e);
	}
})

router.post('/withdrawNotify', helpingLib.tokenMiddleware, (req, res) => {
	try {
		let userId  = req.userId;
		async.parallel({
			usersData:function(cb){
				withdraw.find({"user_id": userId}, {_id:0, currency:1, amount:1, fee_amt:1, reference_no:1, created_at:1, status:1}).sort({created_at : -1}).exec(cb);
			}
		},function(err,results){
			if (err) return res.status(500).send(err);
			res.send({status:true, data:results.usersData});
		});
	} catch(e) {
		console.log("withdrawhistory",e);
	}
})

router.post('/swapNotify', helpingLib.tokenMiddleware, (req, res) => {
	try {
		let userId  = req.userId;
		async.parallel({
			usersData:function(cb){
				swapOrder.find({"user_id": userId}, {_id:0, from_symbol:1, to_symbol:1, amount:1, fees:1, price:1, created_at:1, type:1, total:1}).sort({created_at : -1}).exec(cb);
			}
		},function(err,results){
			if (err) return res.status(500).send(err);
			res.send({status:true, data:results.usersData});
		});
	} catch(e) {
		console.log("swaphistory",e);
	}
})

router.post('/otcNotify', helpingLib.tokenMiddleware, (req, res) => {
	try {
		let userId  = req.userId;
		async.parallel({
			usersData:function(cb){
				otcOrder.find({"user_id": userId}, {_id:0, from_symbol:1, to_symbol:1, amount:1, fees:1, price:1, created_at:1, type:1, total:1}).sort({created_at : -1}).exec(cb);
			}
		},function(err,results){
			if (err) return res.status(500).send(err);
			res.send({status:true, data:results.usersData});
		});
	} catch(e) {
		console.log("swaphistory",e);
	}
})

router.post('/notificationNotify', helpingLib.tokenMiddleware, (req, res) => {
	try{
		let userId  = req.userId;
		async.parallel({
			usersData:function(cb){
				notify.find({user_id:userId, status:{$in:[0, 1] }}, {category:1, message:1, page:1, created_at:1, status:1}).sort({created_at:-1}).exec(cb);
			}
		},function(err,results){
			if (err) return res.status(500).send(err);
			formatNotify(results.usersData, function(notiRes) {
				res.send({status:true, data:notiRes});
			});
		});
	} catch(e) {
		console.log("notificationhistory",e);
	}
})

router.post('/clearNotify', helpingLib.tokenMiddleware, (req, res) => {
	try{
		let userId  = req.userId;
		if (req.body.ttoken != undefined && req.body.ttoken != "") {
			let id = encdec.decryptNew(req.body.ttoken);
			notify.updateOne({_id:mongoose.mongo.ObjectId(id)}, {"$set":{status:2}}).exec(function(upErr,upRes) {
				if(upRes) {
					res.json({success:1});
				} else {
					res.json({success:0, msg:"Invalid request"});
				}
			});
		} else {
			return res.json({success:0, msg:"Invalid Request"});
		}
	} catch(e) {
		console.log("notificationhistory",e);
	}
})

function formatNotify(noti, callback) {
	if(noti.length > 0) {
		hists = [];
		let histArr; let i = 1; let len = noti.length;
		noti.forEach((val) => {
			let token = encdec.encryptNew(val._id.toString());
			histArr = {'created_at':val.created_at, 'token':token, 'page':val.page, 'category':val.category, 'message':val.message, 'status':val.status};
			hists.push(histArr);
			if(i == len) { callback(hists); }
			i = i + 1;
		})
	} else {
		callback([]);
	}
}

router.post('/referralHistory', helpingLib.tokenMiddleware, (req, res) => {
	try{
		let userId  = req.userId;
		async.parallel({
			usersData:function(cb){
				referral.find({"user_id": userId}, {}).sort({created_at : -1}).exec(cb);
			}
		},function(err,results){
			if (err) return res.status(500).send(err);
			res.send({status:true, data:results.usersData});
		});
	} catch(e) {
		console.log("referralhistory",e);
	}
})

router.post('/loginNotify', helpingLib.tokenMiddleware, (req, res) => {
	try {
		let userId  = req.userId;
		async.parallel({
			usersData:function(cb){
				userhistory.find({"user_id": userId}, {_id:0, browser:1, deviceinfo:1, ip_address:1, created_at:1}).sort({created_at : -1}).exec(cb);
			}
		},function(err,results){
			if (err) return res.status(500).send(err);
			res.send({status:true, data:results.usersData});
		});
	} catch(e) {
		console.log("loginhistory",e);
	}
})

router.get('/get_total_users', (req, res) => {
	try{
		users.find().countDocuments().exec(function(err,resData) {
			res.json(resData)
		})
	} catch(e) {
		console.log(e)
	}
})

module.exports = router;