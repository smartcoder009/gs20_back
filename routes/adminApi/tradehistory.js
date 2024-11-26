const express = require('express');
const router = express.Router();
const async = require('async');
const mongoose = require('mongoose');
const moment = require('moment');

const endecrypt = require('../../helpers/newendecryption');
const common = require('../../helpers/common');
const users = require('../../model/users');
const orderDb = require('../../model/CoinOrder');
const tempDb = require('../../model/mapping');
const swapOrder = require('../../model/swapOrder');
const otcOrder = require('../../model/otcOrder');
const pairsDb = require('../../model/pairs');

let response = {};
let updatedDate = ()=>{ return new Date(); };

router.post('/activehistory', common.tokenMiddleware, function(req, res, next) {
	var userRes = {};	
	var info = req.body;
	var search = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var size = parseInt(info.pageSize);
	var sortName = info.sortActive;
	var srt   = {}
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var skip = size * pageNo;

	// search
	var cnt = {status: { $in:['active', 'partially']}}
	if(search != ""){
		var newDate = "";
		var newDate1 = "";
		if(moment(new Date(search), "YYYY-MM-DD h:mm:ss").isValid()) {
			var searchDate = new Date(search);
			var srdate = new Date(search);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() - 1 );
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();
		}
		cnt['$or'] = [{'users.username': { $regex: '.*' + search + '.*',$options: 'i' }},
		{'Type': { $regex: '.*' + search + '.*',$options: 'i' }},
		{'status': { $regex: '.*' + search + '.*',$options: 'i' }},
		{'firstCurrency': { $regex: '.*' + search + '.*',$options: 'i' }},{'secondCurrency': { $regex: '.*' + search + '.*',$options: 'i' }}];
		search = parseFloat(search);
		if(search >= 0){
			if((newDate) && (newDate1)) {
				cnt['$or'].push({'Amount': { $eq: parseFloat(search)}},
					{'Price': { $eq: parseFloat(search)}},
					{'Total': { $eq: parseFloat(search)}},
					{'updated_at': { $gt: new Date(newDate), $lte: new Date(newDate1)}})
			} else {
				cnt['$or'].push({'Amount': { $eq: parseFloat(search)}},
					{'Price': { $eq: parseFloat(search)}},
					{'Total': { $eq: parseFloat(search)}})
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
		orderDbCount:function(cb) {
			orderDb.aggregate( [{
				$lookup: {
					from: "user_info",
					localField: "user_id",
					foreignField: "_id",
					as: "users"
				}},
				{$match: cnt},
				]).exec(cb)
		},
		orderDbData :function (cb){
			orderDb.aggregate([
				{ $lookup: {
					from: "user_info",
					localField: "user_id",
					foreignField: "_id",
					as: "users"
				}},				
				{$match: cnt},
				{
					$project : {
						_id : 1,						
						"from":"$firstCurrency",
						"to":"$secondCurrency",
						"Amount": "$Amount",
						"Price": "$Price",
						"Total": "$Total",
						"Type": "$Type",
						"fee_per":"$fee_per",
						"status" : "$status",
						"updated_at": "$updated_at",
						"username": {$arrayElemAt:["$users.username",0]}
					}
				},
				{ "$sort": srt },
				{ "$skip": skip },
				{ "$limit": size }
				]).exec(cb) 
		},
	},function(err,results){
		if (err) { return res.status(500).send(err); }
		common.formatOrderHist(results.orderDbData, function(openRes) {
			response.status      = true;
			response.data        = openRes;
			response.activeCount = results.orderDbCount.length;
			res.json(response);
		});
	});
});

router.post('/filledhistory', common.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	var search = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var sortName = info.sortActive;
	var srt   = {}
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var size = (info.export_hist == 1) ? 10000 : parseInt(info.pageSize);
	var skip = size * pageNo;
	// search
	var cnt;
	if(search != "") {
		var newDate = "";
		var newDate1 = "";
		if(moment(new Date(search), "YYYY-MM-DD h:mm").isValid()) {
			var searchDate = new Date(search);
			var srdate = new Date(search);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();
		}
		cnt = { cancel_id:null, $or:[{'buyuser.username': { $regex: '.*' + search + '.*',$options: 'i' }},
		{'selluser.username': { $regex: '.*' + search + '.*',$options: 'i' }},
		{'pair': { $regex: '.*' + search + '.*',$options: 'i' }} ]};
		search = parseFloat(search);
		if(search >= 0) {
			if((newDate) && (newDate1)) {
				cnt['$or'].push({'askPrice': { $eq: parseFloat(search)}},
					{'filledAmount': { $eq: parseFloat(search)}},
					{'total': { $eq: parseFloat(search)}},
					{'buy_fee': { $eq: parseFloat(search)}},
					{'sell_fee': { $eq: parseFloat(search)}},
					{'datetime': { $gte: new Date(newDate), $lt: new Date(newDate1)}})
			} else {
				cnt['$or'].push({'askPrice': { $eq: parseFloat(search)}},
					{'filledAmount': { $eq: parseFloat(search)}},
					{'total': { $eq: parseFloat(search)}},
					{'buy_fee': { $eq: parseFloat(search)}},
					{'sell_fee': { $eq: parseFloat(search)}})
			}
		}
	} else {
		cnt = { cancel_id:null };
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
		tempDbCount:function(cb) {
			tempDb.aggregate( [{
				$lookup: {
					from: "user_info",
					localField: "buyerUserId",
					foreignField: "_id",
					as: "buyuser"
				}},
				{
					$lookup: {
						from: "user_info",
						localField: "sellerUserId",
						foreignField: "_id",
						as: "selluser"
					}
				},
				{"$match": cnt},
				] ).exec(cb)
		},
		tempDbData :function (cb){
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
					"buy_fee": "$buy_fee",
					"sell_fee" : "$sell_fee",
					"datetime": "$datetime",
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
		response.status = true;
		response.data = results.tempDbData;
		response.filledCount = results.tempDbCount.length;
		res.json(response);
	})
});

// get pairs data
router.get('/swapPairs', common.tokenMiddleware, (req,res) => {
	pairsDb.find({fee_type:"percent"}, {from_symbol:1, to_symbol:1, last_price:1, status:1, created_at:1}).exec(function(error,resData) {
		if (error) { return next(error); }
		res.json({status:true, data:resData });
	})
});

router.get('/editPair/:id', (req,res) => {
	var id = req.params.id;	
	pairsDb.findOne({"_id": id}, {from_symbol:1, to_symbol:1, swap_min:1, swap_max:1, swap_fee:1}).exec(function(er, res1) {
		if (er) { return next(er); }
		if(res1){
			let resp = {_id:res1._id, pair:res1.from_symbol+'/'+res1.to_symbol, swap_min:res1.swap_min, swap_max:res1.swap_max, swap_fee:res1.swap_fee};
			res.json({status:true, data:resp });
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
	let obj = { "swap_fee":parseFloat(info.swap_fee), "swap_min":parseFloat(info.swap_min), "swap_max":parseFloat(info.swap_max), "created_at":updatedDate() };
	pairsDb.updateOne({"_id":info._id}, {"$set":obj}).exec(function(err, resUpdate) {
		if(resUpdate) {
			res.json({status:true, msg:"Successfully updated"});
		} else {
			res.json({status:false, msg:"Invalid request. Please Try again"});
		}
	});
});

router.post('/swapHistory', common.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	var filter = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var size = parseInt(info.pageSize);
	var sortName = info.sortActive;
	var srt = {}
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var skip = size * pageNo;
	var limit = size;

	// search
	var search = {};
	if(filter !="") {
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
		search['$or'] = [{'user.username': regex}, {'from_symbol': regex}, {'to_symbol': regex}, {'status': regex}];
		filter = parseFloat(filter);
		if(filter >= 0){
			if((newDate) && (newDate1)) {
				search['$or'].push({'amount': { $eq: parseFloat(filter)}},{'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}});
			} else{
				search['$or'].push({'amount': { $eq: parseFloat(filter)}});
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
		swapData:function(cb) {
			swapOrder.aggregate([
			{
				$lookup: {        
					from: "user_info",        
					localField: "user_id",
					foreignField: "_id",        
					as: "user"
				}  
			},
			{ $match: search },
			{
				$project : {
					_id: 0, user_id: 1, amount:1, status:1, total:1, fees:1, from_symbol:1, to_symbol:1,
					type:1, price:1, created_at:1, user:{$arrayElemAt:["$user.username",0]}
				}
			},
			{ "$sort": srt },
			{ "$skip": skip },
			{ "$limit": limit }
			]).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		let resp = { status:true, data:results.swapData, swapCount:results.swapData.length };
		res.json(resp);
	});
});

router.post('/otcHistory', common.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	var filter = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var size = parseInt(info.pageSize);
	var sortName = info.sortActive;
	var srt   = {}
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var query = {};
	query.sort = srt;
	query.skip = size * pageNo;
	query.limit = size;

	// search
	var search = {};
	if(filter !="") {
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
		search['$or'] = [{'email': regex}, {'from_symbol': regex}, {'to_symbol': regex}, {'status': regex}];
		filter = parseFloat(filter);
		if(filter >= 0){
			if((newDate) && (newDate1)) {
				search['$or'].push({'amount': { $eq: parseFloat(filter)}},{'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}});
			} else{
				search['$or'].push({'amount': { $eq: parseFloat(filter)}});
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
		otcData:function(cb) {
			otcOrder.find(search, {email:1, amount:1, status:1, total:1, fees:1, created_at:1, from_symbol:1, to_symbol:1, type:1, price:1, user_type:1, firstname:1, lastname:1, contact:1, timezone:1, note:1}, query).sort({'created_at':-1}).exec(cb)
		}
	}, function(err,results) {
		if (err) return res.status(500).send(err);
		let resp = { status:true, data:results.otcData, swapCount:results.otcData.length };
		res.json(resp);
	});
});

module.exports = router;