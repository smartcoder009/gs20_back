var express = require('express');
var router = express.Router();
var async  = require('async');
var mongoose = require('mongoose');
var moment = require('moment');
var mail     = require('../../helpers/mail');
let helpingLib = require('../../helpers/common');
const validator = require('validator');

var deposit = require('../../model/deposit');
var listCoin = require('../../model/listCoin');
let users = require('../../model/users');
let currency = require('../../model/currency');
let notify = require('../../model/notify');
var encdec = require('../../helpers/newendecryption');

let response = {};
//let updatedDate = new Date().toISOString();
let updatedDate = ()=>{
	return new Date();
};

router.post('/depositList', helpingLib.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	var filter = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var size = parseInt(info.pageSize);
	var sortName = info.sortActive;
	var srt   = {}
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var skip = size * pageNo;
	var limit = size;

	// search
	var search = {};
	if(filter !="") {
		var fl = filter.toLowerCase();
		let ismail = validator.isEmail(fl);
		if(ismail) {
			var first = encdec.encryptNew(encdec.firstNewMail(fl));
			var second = encdec.encryptNew(encdec.secondNewMail(fl));
			search = {'user.primary_value':first, 'user.added_val':second};
		} else {
			var regex = new RegExp(filter, "i");
			var newDate = "";
			var newDate1 = "";
			if(moment(new Date(filter), "YYYY-MM-DD h:mm:ss").isValid()) {
				var searchDate = new Date(filter);
				var srdate = new Date(filter);
				searchDate.setDate( searchDate.getDate());
				srdate.setDate( srdate.getDate() + 1 ); 
				newDate = searchDate.toISOString();
				newDate1 = srdate.toISOString();
			}
			search['$or'] = [{'user.username': regex}, {'currency': regex},{'status': regex},{'txnid': regex}];
			filter = parseFloat(filter);
			if(filter >= 0){
				if((newDate) && (newDate1)) {
					search['$or'].push({'amount': { $eq: parseFloat(filter)}},{'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}});
				} else{
					search['$or'].push({'amount': { $eq: parseFloat(filter)}});
				}
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
		search['$or'] = [{'created_at': { $gte:  new Date(start), $lt:  new Date(end)}}];
	}

	async.parallel({
		depositCount:function(cb) {
			deposit.aggregate( [{   
				$lookup: {        
					from: "user_info",        
					localField: "user_id",
					foreignField: "_id",        
					as: "user"
				}  
			},
			{ $match : search },
			] ).exec(cb)
		},
		depositData:function(cb) {
			deposit.aggregate([
			{   
				$lookup: {        
					from: "user_info",        
					localField: "user_id",
					foreignField: "_id",        
					as: "user"
				}  
			},
			{
				$match: search
			},
			{
				$project : {
					_id: 1,
					user_id: 1,
					amount:1,
					reference_no:1,								
					currency:1,				
					created_at:1,
					status:1,
					payment_type:1,
					proof:1,
					reason:1,
					user:{$arrayElemAt:["$user.username",0]},
					primary_value:{$arrayElemAt:["$user.primary_value",0]},
					added_val:{$arrayElemAt:["$user.added_val",0]}
				}
			},
			{ "$sort": srt },
			{ "$skip": skip },
			{ "$limit": limit }
			]).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		response.status    = true;
		response.data      = results.depositData;
		for(i=0;i<response.data.length;i++){
			let first  = response.data[i].primary_value;
			let second = response.data[i].added_val;
			if(first && second){
				response.data[i].email = encdec.decryptNew(first)+encdec.decryptNew(second);
			}
		}
		response.depositCount = results.depositCount.length;
		res.json(response);
	});
});

router.post('/updateDeposit', helpingLib.tokenMiddleware, function(req, res, next) {
	let info = req.body;
	let depId = info._id;
	if(info.status == "completed") {
		deposit.findByIdAndUpdate({_id:info._id}, {$set:{status:"completed", amount:info.value, updated_at:new Date()}}, {multi:true}).exec(function(upData,upRes){
			if(upRes) {
				helpingLib.findUserBalance(upRes.user_id, upRes.currency, (finBal) => {
					let newbal = finBal + parseFloat(info.value);
					helpingLib.updateUserBalance(upRes.user_id, upRes.currency, newbal, (newbal1) => {
						var damt = info.value+' '+upRes.currency;
						let notObj = {user_id:upRes.user_id, category:upRes.currency+" Deposit Completed", message:'Your deposit is completed successfully for '+damt};
						notify.create(notObj, function(notErr, notRes) {});
						res.json({status:true, msg:"Deposit approved successfully"});
					})
				})
			} else {
				res.json({status:false, msg:"Failed to update deposit"});
			}
		});
	} else {
		deposit.findByIdAndUpdate({_id:info._id}, {$set:{status:"rejected", reason:info.value, updated_at:new Date()}}, {multi:true}).exec(function(upData,upRes) {
			if(upRes) {
				let notObj = {user_id:upRes.user_id, category:upRes.currency+" Deposit Rejected", message:'Your deposit is rejected for the Reason: '+info.value};
				notify.create(notObj, function(notErr, notRes) {})
				res.json({status:true, msg:"Deposit rejected successfully"});
			} else {
				res.json({status:false, msg:"Failed to update deposit"});
			}
		});
	}
});

router.post('/coinList', helpingLib.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	var filter = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var size = parseInt(info.pageSize);
	var sortName = info.sortActive;
	var srt   = {}
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var skip = size * pageNo;
	var limit = size;
	
	// search
	var search = {};
	if(filter !="") {
		var fl = filter.toLowerCase();
		var regex = new RegExp(filter, "i");
		var newDate = "";
		var newDate1 = "";
		if(moment(filter, "YYYY-MM-DD h:mm:ss").isValid()) {
			var searchDate = new Date(filter);
			var srdate = new Date(filter);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();
		}
		search['$or'] = [{'email': regex},{'coin_name': regex},{'coin_ticker': regex},{'status': regex}];

		filter = parseFloat(filter);
		if(filter >= 0){
			if((newDate) && (newDate1)) {
				search['$or'].push({'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}});
			}
		}
	}
	async.parallel({
		coinCount:function(cb) {
			listCoin.find(search).countDocuments().exec(cb)
		},
		coinData:function(cb) {
			listCoin.find(search, { coin_ticker:1,email:1,coin_name:1,status:1,created_at:1}).sort({'updated_at': -1 }).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		response.status    = true;
		response.data      = results.coinData;
		response.coinCount = results.coinCount;
		res.json(response);
	})
});

router.post('/deposit_details', helpingLib.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	var days = parseInt(info.filter);
	deposit.aggregate([
		{ $match: {created_at:{ $gte:new Date(new Date().setDate(new Date().getDate() - days)) }} },
		{ $group: { _id: "$currency", amount:{ $sum:"$amount" } } }
		]).exec(function(depErr, depRes) {
			res.json({status:true, data:depRes});
		});
	});
module.exports = router;