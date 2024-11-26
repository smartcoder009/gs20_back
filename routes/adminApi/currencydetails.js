const express  = require('express');
const router   = express.Router();
const toFixed = require('tofixed');
const multer  = require('multer');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const cloudinary = require('../../helpers/cloudinary');

const currency = require('../../model/currency');
const currencydetails = require('../../model/currencydetails');
const common = require('../../helpers/common');
const async  = require('async');
const moment = require('moment');

let response = {};
let updatedDate = ()=>{ return new Date(); };

router.get('/currencydetails',common.tokenMiddleware, (req,res) => {
	var total = 0;
	currency.aggregate([
		{   
		$lookup: {        
			from: "currencydetails",
			localField: "_id",
			foreignField: "currency_id",
			as: "currencydet"
		}  
		},	
		{$project : {		
			details:{$arrayElemAt:["$currencydet.details",0]},
			id:{$arrayElemAt:["$currencydet._id",0]},
			name:1,
			symbol:1, 
			details:1,
		}}
	]).exec(function(err_wallet,resData_wallet){ 
		res.json({ status : true, data: resData_wallet })
	});
});

router.get('/editCurrencydetails/:id', (req,res) => {
	var id = req.params.id; 
	currencydetails.aggregate([
		{$lookup:{
			from: "currency",
			localField: "currency_id",
			foreignField: "_id",
			as: "cr"
		}},
		{
		$match: {
			currency_id:mongoose.mongo.ObjectId(id),			
			}
		},
		{$unwind:"$cr"},
		{$project:{
			details:1,
			name:"$cr.name",
			symbol:"$cr.symbol"
		}}
	]).exec(function(error,resData){ 
		if (error) {
			return next(error);
		}
		if(resData[0]){
			res.json({status : true, data : resData[0] });
		} else {
			res.json({status : true, msg : "Invalid request. Please Try again" });
		}
	});
});

router.post('/updateCurrencydetails',common.tokenMiddleware, (req,res) => {
	let info = req.body; 
	let obj = {		 
		"details" : info.details,
		"updated_at" : updatedDate()
	};	
	currencydetails.findOne({"currency_id":mongoose.Types.ObjectId(info._id)}).exec(function(error,resData){		
		if(resData) {   
			currencydetails.updateOne({ "currency_id": mongoose.Types.ObjectId(info._id)},{ "$set": obj }).exec(function(err, resUpdate){
				if(resUpdate) {
					response = {status : true, msg : "Successfully updated"};
				} else {
					response = {status : false, msg : "Invalid request. Please Try again"};
				}
				res.json(response);	
			});
		}else{
			var userObj = mongoose.Types.ObjectId(info._id);
			let createData  =	{		 
				"details" : info.details,
				"updated_at" : updatedDate(),
				"currency_id" :mongoose.Types.ObjectId(info._id)
			}
			currencydetails.create( createData, function(err,result) {      
				if(result) {
					response = {status : true, msg : "Successfully updated dfd"};
				} else {
					response = {status : false, msg : "Invalid request. Please Try again"};
				}
			});
			res.json(response);
		}
	});
});
 
module.exports = router;