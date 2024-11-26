const express = require('express');
const multer  = require('multer');
const path = require('path');
const async  = require('async');
const toFixed = require('tofixed');
const helpingLib = require('../../helpers/common');
const moment = require('moment');

const router = express.Router();
const mongoose = require('mongoose');
const ipInfo = require("ipinfo");
const useragent = require('useragent');
const validator  = require('validator');
const encdec = require('../../helpers/newendecryption');
const mail     = require('../../helpers/mail');

const admin = require('../../model/adminWallet');
const adminhis = require('../../model/adminHistory');
const withdraw = require('../../model/wltTransactions');
const deposit = require('../../model/wltDeposits');
const currency   = require('../../model/currency');

const coinAddr = require('../../config/CoinAddress');
const WAValidator = require('wallet-address-validator');
const request = require('request');
const speakeasy = require('speakeasy');

var Client = require('node-rest-client').Client;
var restCli = new Client();

let updatedDate = ()=>{ return new Date(); };

let response = {};

router.post('/transactionHistory', helpingLib.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	var filter = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var size = parseInt(info.pageSize);
	var sortName = info.sortActive;
	var actionType = info.actionType;

	var srt   = {}
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var skip = size * pageNo;
	var limit = size;
	
	var query = {};
	query.sort = srt;
	query.skip = size * pageNo;
	query.limit = size;
	// search
	var search = {cointype:actionType};
	if(filter !="") {
		var fl = filter.toLowerCase();
		var regex = new RegExp(filter, "i");
		var newDate = "";
		var newDate1 = "";
		if(moment(filter, "YYYY-MM-DD h:mm").isValid()) {
			var searchDate = new Date(filter);
			var srdate = new Date(filter);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();				
		}
		search['$or'] = [{'txnid':  regex},{'currency':  regex},{'status':  regex}];
		filter = parseFloat(filter);
		if(filter >= 0){
			if((newDate) && (newDate1)) {
				search['$or'].push({'total_amount': { $eq: parseFloat(filter)}},
					{'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}}); 
			} else{
				search['$or'].push({'total_amount': { $eq: parseFloat(filter)}});
			}
		}
	}
	async.parallel({
		transCount:function(cb) {
			withdraw.find(search).countDocuments().exec(cb)
		},
		transData:function(cb) {
			withdraw.find(search, { txnid:1,currency:1,status:1,total_amount:1,created_at:1,withdraw_address:1 }, query).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		response.status    = true;
		response.data      = results.transData;
		response.transCount = results.transCount;
		res.json(response);
	})
});

router.post('/depositHistory', helpingLib.tokenMiddleware, function(req, res, next) {
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
	
	var query = {};
	query.sort = srt;
	query.skip = size * pageNo;
	query.limit = size;
	// search
	var search = {};
	if(filter !="") {
		var fl = filter.toLowerCase();
		var regex = new RegExp(filter, "i");
		var newDate = "";
		var newDate1 = "";
		if(moment(filter, "YYYY-MM-DD h:mm").isValid()) {
			var searchDate = new Date(filter);
			var srdate = new Date(filter);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();				
		}
		search['$or'] = [{'txnid':regex}, {'currency':regex}];
		filter = parseFloat(filter);
		if(filter >= 0){
			if((newDate) && (newDate1)) {
				search['$or'].push({'amount': { $eq: parseFloat(filter)}},
					{'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}}); 
			} else{
				search['$or'].push({'amount': { $eq: parseFloat(filter)}});
			}
		}
	}
	async.parallel({
		transCount:function(cb) {
			deposit.find(search).countDocuments().exec(cb)
		},
		transData:function(cb) {
			deposit.find(search, { txnid:1,currency:1,amount:1,created_at:1 }, query).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		response.status    = true;
		response.data      = results.transData;
		response.transCount = results.transCount;
		res.json(response);
	})
});

router.post('/sendOtp', helpingLib.tokenMiddleware, (req,res) => {
	var request = req.body;
	let userId = req.userId;
	admin.findOne({"_id":userId}, {reset_code:1, ownermail:1}).exec(function(passErr, passRes) {
		if(passRes) {
			let otp = helpingLib.generateRandomNumber();
			let encOtp = encdec.encryptNew(otp.toString());
			admin.updateOne({"_id":userId}, {"$set":{"reset_code":encOtp}}, {multi:true}).exec(function(err, resUp) {
				if(resUp) {
					// var to = 'shaynetan92@gmail.com';
					var to = passRes.ownermail;
					var specialVars = { '###OTP###':otp };
					mail.sendMail(to, 'Admin_wallet_otp', specialVars, function(mailRes) { });
					res.json({status:true, msg:"OTP Sent"});
				} else {
					res.json({status:false, msg:"Failed to update OTP"});
				}
			});
		}
	});	
});

router.post('/adminfund', helpingLib.tokenMiddleware, function(req,res)  {
	try {
		let info = req.body;
		var coinType = info.type;
		var address = info.withdraw_address;
		var withTag = info.memo;
		var currency = info.currency;
		var otpCode = info.otp_code;
		var network = info.network;
		let userId = req.userId;
		let ownerkey = encdec.encryptNew(info.password)
		let encOtp = encdec.encryptNew(otpCode)
		let validUser = validator.isMongoId(userId);
		if(validUser) {
			admin.findOne({_id:userId, ownerkey:ownerkey, reset_code:encOtp}).exec(function(err,resData){
				if(resData) {
					var args = { data: {currency:currency, network:network}, headers: {"Content-Type":"application/json"} };
					restCli.post("http://172.31.45.154/api/balance", args, function (balRes, balFul) {
						if(balRes.status == 1) {
							let wltBalance = parseFloat(balRes.result);
							if(parseFloat(info.total_amount) < wltBalance) {
								let rand = helpingLib.generateRandomNumber();
								let statusLink = helpingLib.generateRandomUser();
								var Url = encdec.wltNewUrl(req);	
								let ipaddress = req.header('x-forwarded-for') || req.connection.remoteAddress.replace("::ffff:", "");
								let objData = {
									adminId : userId,
									currency : currency,
									total_amount : parseFloat(info.total_amount).toFixed(8),
									cointype : "Withdraw",
									basecoin: network,
									ip_address : ipaddress,
									statusLink : statusLink,
									withdraw_address: info.withdraw_address,
									withdraw_tag: withTag
								}
								withdraw.create(objData, function(Witherr,withRes){
									if(withRes) {
										// var to = 'shaynetan92@gmail.com';
										var to = resData.ownermail;
										var specialVars = {
											'###CURRENCY###': currency,
											'###AMT###': info.total_amount,
											'###LINK1###': Url+'pages/verifywithdraw/'+statusLink,
											'###LINK2###': Url+'pages/cancelwithdraw/'+statusLink
										};
										mail.sendMail(to, 'Admin_wallet_withdraw_confirm', specialVars, function(mailRes) {	});
										admin.updateOne({_id:userId}, {"$set":{reset_code:""}}, {multi:true}).exec(function(err, resUp) { });
										res.json({status:true, msg:"Withdraw request sent successfully. Check your email to confirm the request."});
									} else {
										res.json({ status:false, msg:"Something went wrong" })
									}
								})
							} else {
								res.json({ status:false, msg:"Insufficient balance in your wallet" })
							}
						} else {
							res.json({ status:false, msg:"Failed to get balance" })
						}
					});
				} else {
					res.json({status:false, msg:"Incorrect password"})
				}
			})
		} else {
			res.json({ status:false, msg:"Something went wrong. Please try again" })
		}
	} catch (e){
		res.status(401).send('unauthorized')
	}
});

router.post('/releaseConfirm', helpingLib.tokenMiddleware, (req,res) => {
	try {
		let userId  = req.userId; 
		let Request = req.body;
		let validUser = validator.isMongoId(userId);
		let validId = mongoose.mongo.ObjectId(userId);
		if(validUser){
			withdraw.findOne({adminId:validId, statusLink: Request._id, status : 'Pending' }).exec(function(err,resData) {
				if(resData){
					var args = { data: {currency:resData.currency, amount:resData.total_amount, address:resData.withdraw_address, tag:resData.withdraw_tag, network:resData.basecoin}, headers: {"Content-Type":"application/json"} };
					restCli.post("http://172.31.45.154/api/withdraw", args, function (upRes, upFul) {
						if(upRes.status == 1) {
							let txnid = upRes.result;
							if(txnid) {
								withdraw.findOneAndUpdate({adminId:validId, statusLink:Request._id}, {"$set":{status:'Completed', statusLink:'', txnid:txnid}}, {multi:true}).exec(function(updateError,updateRes) {
									if(updateRes){
										res.json({ status : true, msg : "Withdraw confirmed successfully" })
									} else {
										res.json({ status : false, msg : "Something went wrong" }) 
									}
								})
							} else {
								res.json({ status : false, msg : "Something went wrong. Please try again" })
							}
						} else {
							res.json({ status: false, msg: upRes.msg });
						}
					});
				} else {
					res.json({ status : false, msg : "Your withdraw is already confirmed or cancelled" })
				}
			})
		} else {
			res.json({ status : false, msg : "Something went wrong. Please try again" })
		}
	} catch(e){
		res.status(401).send('unauthorized')
	}
});

router.post('/releaseCancel', helpingLib.tokenMiddleware, (req,res) => {
	try{
		let userId  = req.userId;  
		let Request = req.body;
		let validUser = validator.isMongoId(userId);
		let validId = mongoose.mongo.ObjectId(userId);
		if(validUser){
			withdraw.findOne({adminId: validId, statusLink: Request._id, status : 'Pending' }).exec(function(err,resData) {
				if(resData) {
					withdraw.findOneAndUpdate({adminId:validId,statusLink: Request._id},{"$set" : { status : 'Cancelled', statusLink : ''}},{multi:true}).exec(function(updateError,updateRes){
						if(updateRes){
							res.json({ status:true, msg : "Withdrawal cancelled successfully" })
						}
					})
				} else {
					res.json({status:false, msg:"Your withdraw request is already confirmed or cancelled"})
				}
			})
		} else {
			res.json({status : false, msg : "Somethinge went wrong. Please try again" })
		}
	} catch(e){
		res.status(401).send('unauthorized')
	}
});

module.exports = router;