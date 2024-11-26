const express = require('express');
const router = express.Router();
const async  = require('async');
const mongoose = require('mongoose');
const moment = require('moment');

const mail = require('../../helpers/mail');
const helpingLib = require('../../helpers/common');
const encdec = require('../../helpers/newendecryption');

const withdraw = require('../../model/withdraw');
const users = require('../../model/users');
const currency = require('../../model/currency');
const userAddress = require('../../model/userAddress');
const profitDb   = require('../../model/profit');
const notify  = require('../../model/notify');
const whiteip = require('../../model/whiteip');
const admin = require('../../model/admin');
const otcOrder = require('../../model/otcOrder');

var Client = require('node-rest-client').Client;
var restCli = new Client();

let response = {};
let updatedDate = ()=>{ return new Date(); };

/* GET users withdraw listing. */
router.post('/withdrawList',helpingLib.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	// info.filter = info.selected;
	var type = 'completed';
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
	var regex = new RegExp(filter, "i");

	if(filter !="") {
		var fl = filter.toLowerCase();	
		var newDate = "";
		var newDate1 = "";
		if(moment(new Date(filter), "YYYY-MM-DD h:mm").isValid()) {
			var searchDate = new Date(filter);
			var srdate = new Date(filter);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();
		}if(type!=undefined){
			search = {$and:[{ 'status': { $ne:'pending'} },
			{'currency':  regex}]};
		}else{
			search = {$or:[{'username':  regex},
			{'currency':  regex}]};		
		}
			// search = {$or:[{'user.username':  regex},{'currency':  regex},
			//  {$and:[{'status':{ $ne:'pending'}},{'status':regex}]}
			// ]};
			search = {$or:[{'username':  regex},{'currency':  regex},{'status':regex}]};
			filter = parseFloat(filter);
			if(filter >= 0){
				if((newDate) && (newDate1)) {
					search['$or'].push({'amount': { $eq: parseFloat(filter)}},
						{'fee_amt': { $eq: parseFloat(filter)}},
						{'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}});			
				}
				else{
					search['$or'].push({'amount': { $eq: parseFloat(filter)}},
						{'fee_amt': { $eq: parseFloat(filter)}});
				}
			}
			search = {$and:[{'status': { $ne:'pending'}},search]}
		// }//switch end
	}else if(type!=undefined){
		search = {$and:[{ 'status': { $ne:'pending'} },
		{'currency':  regex}]};
	}else{
		search = {$or:[{'username':  regex},
		{'currency':  regex}]};				
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
		withdrawCount:function(cb) {
			withdraw.aggregate( [{   
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
		withdrawData:function(cb) {
			withdraw.aggregate([
			//{$unwind: "$deposit"},  
			{   
				$lookup: {        
					from: "user_info",        
					localField: "user_id",
					foreignField: "_id",        
					as: "user"
				}  
			},
			{
				$project : {
					_id: 1,
					user_id: 1,
					transfer_amount: 1,
					amount:1,
					fee_amt:1,
					reference_no:1,
					currency:1,
					address_tag:1,
					created_at:1,
					status:1,
					username:1,
					payment_method:1,
					address_info:1,
					ip_address:1,
					admin_id:1,
					primary_value: {$arrayElemAt:["$user.primary_value",0]},
					added_val: {$arrayElemAt:["$user.added_val",0]},
					user: {"_id":{$arrayElemAt:["$user._id",0]},"username":{$arrayElemAt:["$user.username",0]}}
				}
			},
			{
				$match: search
			},
			{ "$sort": srt },
			{ "$skip": skip },
			{ "$limit": limit }
			]).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		let	resData  = results.withdrawData;
		for(i=0;i<resData.length;i++){
			let first  = resData[i].primary_value;
			let second = resData[i].added_val;
			if(first && second) {
				resData[i].email = encdec.decryptNew(first)+encdec.decryptNew(second);
			}
		}
		response.status    = true;
		response.data      = results.withdrawData;
		response.withdrawCount = results.withdrawCount.length;
		res.json(response);
	});
});

router.post('/withdrawPending',helpingLib.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	// info.filter = info.selected;
	var type = 'pending';
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
	var regex = new RegExp(filter, "i");

	if(filter !="") {
		var fl = filter.toLowerCase();	
		var newDate = "";
		var newDate1 = "";
		if(moment(new Date(filter), "YYYY-MM-DD h:mm").isValid()) {
			var searchDate = new Date(filter);
			var srdate = new Date(filter);

			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 

			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();

		}if(type!=undefined){
			search = {$and:[{'status':'pending'},
			{'currency':  regex}]};
		}else{
			search = {$or:[{'username':  regex},
			{'currency':  regex}]};		
		}
		search = {$or:[{'username':  regex},{'currency':  regex},{'status':  regex}]};

		filter = parseFloat(filter);
		if(filter >= 0){
			if((newDate) && (newDate1)) {
				search['$or'].push({'amount': { $eq: parseFloat(filter)}},
					{'fee_amt': { $eq: parseFloat(filter)}},
					{'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}});			
			}
			else{
				search['$or'].push({'amount': { $eq: parseFloat(filter)}},
					{'fee_amt': { $eq: parseFloat(filter)}});
			}
		}
		search = {$and:[{'status': 'pending'},search]}
	}else if(type!=undefined){
		search = {$and:[{'status':'pending'},
		{'currency':  regex}]};
	}else{
		search = {$or:[{'username':  regex},
		{'currency':  regex}]};				
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
		withdrawCount:function(cb) {
			withdraw.aggregate( [{   
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
		withdrawData:function(cb) {
			withdraw.aggregate([
			//{$unwind: "$deposit"},  
			{   
				$lookup: {        
					from: "user_info",        
					localField: "user_id",
					foreignField: "_id",        
					as: "user"
				}  
			},
			{
				$project : {
					_id: 1,
					user_id: 1,
					transfer_amount: 1,
					amount:1,
					fee_amt:1,
					reference_no:1,								
					currency:1,				
					address_tag:1,				
					created_at:1,
					status:1,
					username:1,
					payment_method:1,
					address_info:1,
					ip_address:1,
					primary_value: {$arrayElemAt:["$user.primary_value",0]},
					added_val: {$arrayElemAt:["$user.added_val",0]},
					user: {"_id":{$arrayElemAt:["$user._id",0]},"username":{$arrayElemAt:["$user.username",0]}}
				}
			},
			{
				$match: search
			},
			{ "$sort": srt },
			{ "$skip": skip },
			{ "$limit": limit }
			]).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		let	resData  = results.withdrawData;
		for(i=0;i<resData.length;i++){
			let first  = resData[i].primary_value;
			let second = resData[i].added_val;
			if(first && second) {
				resData[i].email = encdec.decryptNew(first)+encdec.decryptNew(second);
			}
		}
		response.status    = true;
		response.data      = results.withdrawData;
		response.withdrawCount = results.withdrawCount.length;
		res.json(response);
	});
});

router.post('/withdrawList_user',helpingLib.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	withdraw.aggregate([ 
	{   
		$lookup: {        
			from: "user_info",        
			localField: "user_id",
			foreignField: "_id",        
			as: "user"
		}  
	},
	{
		$project : {
			_id: 1,
			user_id: 1,
			transfer_amount: 1,
			amount:1,
			fee_amt:1,
			reference_no:1,								
			currency:1,				
			address_tag:1,				
			created_at:1,
			status:1,
			username:1,
			payment_method:1,
			address_info:1,
			primary_value: {$arrayElemAt:["$user.primary_value",0]},
			added_val: {$arrayElemAt:["$user.added_val",0]},
			user: {"_id":{$arrayElemAt:["$user._id",0]},"username":{$arrayElemAt:["$user.username",0]}}
		}
	},
	{
		$match: {_id:mongoose.mongo.ObjectId(info._id)}
	}
	]).exec(function(err,resData) {
		if (err) return res.status(500).send(err);
		for(i=0;i<resData.length;i++){
			let first  = resData[i].primary_value;
			let second = resData[i].added_val;
			resData[i].email = encdec.decryptNew(first)+encdec.decryptNew(second);
		}
		response.status    = true;
		response.data      = resData;
		res.json(response);
	});
});

router.post('/getWithdraw', helpingLib.tokenMiddleware, (req,res) => {
	var wid = encdec.decryptNew(decodeURIComponent(req.body.ticketToken));
	let info = req.body;
	withdraw.find({_id:wid }).select('_id status with_otp username').exec(function(error,resData){
		if (error) {
			return res.json({status : false, msg: "Try again later" });;
		}
		if(resData && resData.length > 0){
			if(resData[0].status == 'pending') {
				var otp = helpingLib.generateRandomNumber();
				var to = 'admin';
				var specialVars = {
					'###USER###': 'Admin',
					'###OTP###': otp,
					'###USERNAME###': resData[0].username
				};
				if(info.Type == 'reject') {
					res.json({status : true, data : resData });
				} else {
					mail.sendMail(to,'Admin_withdraw_otp',specialVars,function(mailRes) {
						withdraw.findOneAndUpdate({_id : wid},{"$set" : { with_otp : otp}}).exec(function(updateError,updateRes){
							res.json({status : true, data : resData, msg : "Please check your withdraw OTP sent to mail" });
						})				
					});
				}
			} else {
				res.json({status : false, msg : "Withdraw is already approved or cancelled" });
			}
		}
	})
});

router.post('/resend_mail',helpingLib.tokenMiddleware, (req,res) => {
	let Request = req.body;
	if(Request.id != ''){
		let withId = Request.id;
		withdraw.findOne({_id : withId}).select("username amount currency status fee_amt user_id").exec(function(upErr,upRes) {
			if(upErr) { return res.json({success:0, msg:"Failed to confirm withdraw"}); }
			if(upRes){
				if(upRes.status != "pending") {
					var msg1 = (upRes.status == "cancelled") ? "cancelled" : "confirmed";
					return res.json({success:false, msg:"Transaction already "+msg1});
				} else {
					var userId    = upRes.user_id;
					var amount    = upRes.amount;
					var feeAmt    = upRes.fee_amt;
					var username  = upRes.username;
					var selCurr   = upRes.currency;
					var withToken = encdec.encryptNew(withId.toString());
					var encUserId = encdec.encryptNew(userId.toString());
					var cnfrm = encdec.adminNewUrl()+'withdraw?type=confirm&token='+encodeURIComponent(withToken)+'&verify='+encodeURIComponent(encUserId);
					var rejct = encdec.adminNewUrl()+'withdraw?type=reject&token='+encodeURIComponent(withToken)+'&verify='+encodeURIComponent(encUserId);
					var specialVars = {
						'###LINK1###': cnfrm,
						'###LINK2###': rejct,
						'###AMT###': amount.toFixed(8) + " " + selCurr,
						'###FEE###': feeAmt.toFixed(8) + " " + selCurr,
						'###USER###': username
					};
					mail.sendMail("admin", 'withdraw_admin_confirm', specialVars, function(mailRes) {});
					res.json({status:true, msg:"Withdraw request sent to admin"});
				}
			} else {
				res.json({ status : false, msg : "Withdraw is already cancelled or completed" })
			}
		});
	} else {
		res.json({ status:false, msg:"Please try again later" });
	}
});

router.post('/updateWithdraw',helpingLib.tokenMiddleware, (req,res) => {
	let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
	ip = ip.replace('::ffff:', '');
	// whiteip.findOne({"ip_addr":ip}).exec(function(ipErr, ipRes) {
	// 	if(ipRes) {
		let Request = req.body;
		if(Request.status == 1) {
			withdraw.findOne({_id : Request._id, with_otp:Request.otp}).exec(function(upData,upRes){
				if(upRes) {
					var args = { data: {currency:upRes.currency, amount:upRes.transfer_amount, address:upRes.address_info, tag:upRes.address_tag, network:upRes.network}, headers: {"Content-Type":"application/json"}
				};
				restCli.post("http://172.31.45.154/api/withdraw", args, function (resData, response) {
					if(resData.status == 1) {
						let txnid = resData.result;
						let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
						ip = ip.replace('::ffff:', '');
						withdraw.findByIdAndUpdate({_id : Request._id},{$set : {status : "completed",reference_no:txnid, with_otp:"",approve_ip:ip ,updated_at:new Date() }},{multi : true}).exec(function(errData,uptRes){
							if(uptRes){
								let obj = { type:'Withdraw', user_id:upRes.user_id, currency:upRes.currency, amount:upRes.fee_amt };
								if(upRes.fee_amt > 0) {
									profitDb.create(obj, function (err, data) {});
								}
								var sts="Completed"
								users.findOne({"_id":upRes.user_id},{primary_value:1,added_val:1,username:1}).exec(function(err,udata){
									let first  = udata.primary_value;
									let second = udata.added_val;
									var to = encdec.decryptNew(first)+encdec.decryptNew(second);
									var specialVars = {
										'###USER###': udata.username,
										'###CURRENCY###': upRes.currency,
										'###CRNY###': upRes.currency,
										'###AMOUNT###': upRes.amount,
										'###FEE###' : upRes.fee_amt,
										'###TXD###': txnid,
										'###STATUS###': sts,
										'###STS###': sts,
									};
									mail.sendMail(to,'withdraw_admin_complete',specialVars,function(mailRes) { });
									var wamt = upRes.amount+' '+upRes.currency;
									var note = {'user_id':upRes.user_id, 'message':'Your withdraw is completed successfully for '+wamt, 'category':'Withdraw'}
									notify.create(note, function (err, postRes) { });
									return res.json({ status:true, msg : "Withdraw completed successfully" })
								})
							}
						})
					} else {
						res.json({ status:false, msg:resData.msg });
					}
				});
			} else {
				res.json({ status:false, msg:"Invalid OTP" })
			}
		});
		} else {
			withdraw.findByIdAndUpdate({_id : Request._id},{$set : {status : "rejected",reject_reason:Request.reason,cancelled_by:'admin',with_otp:"", updated_at:new Date()}},{multi : true}).exec(function(upData,upRes){
				if(upRes){
					helpingLib.findUserBalance(upRes.user_id,upRes.currency,(finBal) => {
						let newbal = finBal + +upRes.amount
						helpingLib.updateUserBalance(upRes.user_id,upRes.currency,newbal,(newbal1) => {
							var sts="Rejected"
							users.findOne({"_id":upRes.user_id}, {primary_value:1,added_val:1,username:1}).exec(function(err,udata){
								let first  = udata.primary_value;
								let second = udata.added_val;
								var to = encdec.decryptNew(first)+encdec.decryptNew(second);
								var specialVars = {
									'###USER###': udata.username,
									'###CURRENCY###': upRes.currency,
									'###CRNY###': upRes.currency,
									'###AMOUNT###': upRes.amount,
									'###FEE###' : upRes.fee_amt,
									'###TXD###': '-',
									'###REASON###' : req.body.reason,
									'###STATUS###': sts,
									'###STS###': sts
								};
								mail.sendMail(to,'withdraw_admin_reject',specialVars,function(mailRes) { });
								var wamt = upRes.amount+' '+upRes.currency;
								var note = {'user_id':upRes.user_id, 'message':'Your withdraw is rejected for '+wamt, 'category':'Withdraw'}
								notify.create(note, function (err, postRes) { });
								res.json({ status : true, msg : "Withdraw rejected successfully" })
								});//users end
						})
					})
				}
			});
		}
	// 	} else {
	// 		res.json({status:false, msg:"Invalid request"});
	// 	}
	// });
});

router.post('/reject_withdraw',helpingLib.tokenMiddleware, (req,res) => {
	let id = req.userId;
	let info = req.body;
	if(info._id != '' && info.reason != '') {
		admin.findOne({"_id": id}, {ownermail:1}).exec(function(error, resData) {
			if(resData) {
				let adminEmail = resData.ownermail;
				withdraw.findOne({_id : mongoose.mongo.ObjectId(info._id)}).exec(function(checkErr, checkRes) {
					if(checkRes) {
						withdraw.updateOne({_id : mongoose.mongo.ObjectId(info._id)},{$set:{reject_reason:info.reason, admin_id:adminEmail, status:"rejected", updated_at:new Date()}}).exec(function(upErr,upRes) {
							if(upRes.nModified == 1) {
								helpingLib.findUserBalance(checkRes.user_id, checkRes.currency,(finBal) => {
									let newbal = finBal + +checkRes.amount
									helpingLib.updateUserBalance(checkRes.user_id, checkRes.currency, newbal,(newbal1) => {
										users.findOne({"_id":checkRes.user_id}, {primary_value:1,added_val:1,username:1}).exec(function(err,udata){
											let first  = udata.primary_value;
											let second = udata.added_val;
											var to = encdec.decryptNew(first)+encdec.decryptNew(second);
											var specialVars = {
												'###USER###': udata.username,
												'###CURRENCY###': checkRes.currency,
												'###CRNY###': checkRes.currency,
												'###AMOUNT###': checkRes.amount,
												'###FEE###' : checkRes.fee_amt,
												'###TXD###': '-',
												'###REASON###' : req.body.reason,
												'###STATUS###': "Rejected",
												'###STS###': "Rejected"
											};
											mail.sendMail(to, 'withdraw_admin_reject', specialVars,function(mailRes) { });
											var wamt = checkRes.amount+' '+checkRes.currency;
											var note = {'user_id':checkRes.user_id, 'message':'Your withdraw is rejected for '+wamt, 'category':'Withdraw'}
											notify.create(note, function (err, postRes) { });
											res.json({ status:true, msg:"Withdraw Rejected successfully", admin_id:adminEmail });				
										});
									});
								});
							} else {
								res.json({ status:false, msg:"Something went wrong, Please try again later" });
							}
						})
					} else {
						res.json({ status:false, msg:"Something went wrong, Please try again later" });
					}
				})
			} else {
				res.json({status:false, msg:"Invalid request"});
			}
		});
	} else {
		res.json({ status:false, msg:"Something went wrong, Please try again later" });
	}
});

router.post('/add_txid',helpingLib.tokenMiddleware, (req,res) => {
	let id = req.userId;
	let info = req.body;
	if(info._id != '' && info.txid != '') {
		admin.findOne({"_id": id}, {ownermail:1}).exec(function(error, resData) {
			if(resData) {
				let adminEmail = resData.ownermail;
				withdraw.findOne({_id : mongoose.mongo.ObjectId(info._id)}).exec(function(withErr, withRes) {
					if(withErr) { return res.json({success:0, msg:"Failed to confirm withdraw"}); }
					if(withRes) {
						withdraw.updateOne({_id : mongoose.mongo.ObjectId(info._id)},{$set:{reference_no:info.txid, admin_id:adminEmail, status:"completed", updated_at:new Date()}}).exec(function(upErr,upRes) {
							if(upRes.nModified == 1) {
								let obj = { type:'Withdraw Fees', user_id:withRes.user_id, currency:withRes.currency, amount:withRes.fee_amt };
								if(withRes.fee_amt > 0) {
									profitDb.create(obj, function (err, data) {});
								}
								res.json({ status:true, msg:"Withdraw Updated successfully", admin_id:adminEmail });				
							} else {
								res.json({ status:false, msg:"Something went wrong, Please try again later" });
							}
						})
					}
					else {
						res.json({ status:false, msg:"Something went wrong, Please try again later" });
					}
				})
			} else {
				res.json({status:false, msg:"Invalid request"});
			}
		});
	} else {
		res.json({ status:false, msg:"Something went wrong, Please try again later" });
	}
});


router.post('/confirmOTC',helpingLib.tokenMiddleware, (req,res) => {
	let id = req.userId;
	let info = req.body;
	if(info._id != '') {
		admin.findOne({"_id": id}, {ownermail:1}).exec(function(error, resData) {
			if(resData) {
				let adminEmail = resData.ownermail;
				otcOrder.findOne({_id : mongoose.mongo.ObjectId(info._id)}).exec(function(otcErr, otcRes) {
					if(otcErr) { return res.json({success:0, msg:"Failed to confirm OTC"}); }
					if(otcRes) {
						helpingLib.multiBalance(otcRes.user_id, otcRes.from_symbol, otcRes.to_symbol, function(multiBal) {
							if(multiBal) {
								let fromBal = multiBal[otcRes.from_symbol];
								let toBal = multiBal[otcRes.to_symbol];
								if(otcRes.type == "buy") {
									var upCur = otcRes.from_symbol;
									var upBal = fromBal + otcRes.amount;
								} else {
									var upCur = otcRes.to_symbol;
									var upBal = toBal + otcRes.total;
								}
								helpingLib.updateUserBalance(otcRes.user_id, upCur, upBal, function(upRes) {
									if(upRes) {
										otcOrder.updateOne({_id : mongoose.mongo.ObjectId(info._id)},{$set:{status:"completed", admin_id:adminEmail, updated_at:new Date()}}).exec(function(upErr,upRes) {
											if(upRes.nModified == 1) {
												let obj = { type:'OTC Fees', user_id:otcRes.user_id, currency:otcRes.to_symbol, amount:otcRes.fees };
												if(otcRes.fees > 0) {
													profitDb.create(obj, function (err, data) {});
												}
												res.json({ status:true, msg:"OTC Updated successfully", admin_id:adminEmail });				
											} else {
												res.json({ status:false, msg:"Something went wrong, Please try again later" });
											}
										})
									} else {
										res.json({success:0, msg:"Failed to update balance"});
									}
								});
							} else {
								res.json({success:0, msg:"Failed to get balance"});
							}
						})
					}
					else {
						res.json({ status:false, msg:"Something went wrong, Please try again later" });
					}
				})
			} else {
				res.json({status:false, msg:"Invalid request"});
			}
		});
	} else {
		res.json({ status:false, msg:"Something went wrong, Please try again later" });
	}
});

router.post('/RejectOTC',helpingLib.tokenMiddleware, (req,res) => {
	let id = req.userId;
	let info = req.body;
	if(info._id != '') {
		admin.findOne({"_id": id}, {ownermail:1}).exec(function(error, resData) {
			if(resData) {
				let adminEmail = resData.ownermail;
				otcOrder.findOne({_id : mongoose.mongo.ObjectId(info._id)}).exec(function(otcErr, otcRes) {
					if(otcErr) { return res.json({success:0, msg:"Failed to reject OTC"}); }
					if(otcRes) {
						helpingLib.multiBalance(otcRes.user_id, otcRes.from_symbol, otcRes.to_symbol, function(multiBal) {
							if(multiBal) {
								let fromBal = multiBal[otcRes.from_symbol];
								let toBal = multiBal[otcRes.to_symbol];
								if(otcRes.type == "buy") {
									var upCur = otcRes.to_symbol;
									var upBal = toBal + otcRes.total;
								} else {
									var upCur = otcRes.from_symbol;
									var upBal = fromBal + otcRes.amount;
								}
								helpingLib.updateUserBalance(otcRes.user_id, upCur, upBal, function(upRes) {
									if(upRes) {
										otcOrder.updateOne({_id : mongoose.mongo.ObjectId(info._id)},{$set:{status:"cancelled", reject_reason:info.reason, admin_id:adminEmail, updated_at:new Date()}}).exec(function(upErr,upRes) {
											if(upRes.nModified == 1) {
												res.json({ status:true, msg:"OTC Updated successfully"});
											} else {
												res.json({ status:false, msg:"Something went wrong, Please try again later" });
											}
										})
									} else {
										res.json({success:0, msg:"Failed to update balance"});
									}
								});
							} else {
								res.json({success:0, msg:"Failed to get balance"});
							}
						})
					}
					else {
						res.json({ status:false, msg:"Something went wrong, Please try again later" });
					}
				})
			} else {
				res.json({status:false, msg:"Invalid request"});
			}
		});
	} else {
		res.json({ status:false, msg:"Something went wrong, Please try again later" });
	}
});

router.post('/confirm_withdraw',helpingLib.tokenMiddleware, (req,res) => {
	let id = req.userId;
	let info = req.body;
	if(info._id != '') {
		admin.findOne({"_id": id}, {ownermail:1}).exec(function(error, resData) {
			if(resData) {
				let adminEmail = resData.ownermail;
				withdraw.findOne({_id : mongoose.mongo.ObjectId(info._id)}).exec(function(withErr, withRes) {
					if(withErr) { return res.json({success:0, msg:"Failed to confirm withdraw"}); }
					if(withRes) {
						userAddress.findOne({address:{$elemMatch:{value:withRes.address_info}}}).exec(function(err,resData) {
							if(resData) {
								var txid = "Internal Transfer";
								let depositData = {
									amount : withRes.transfer_amount,
									currency : withRes.currency,
									payment_method : withRes.currency + " Payment",
									reference_no : txid,
									status : "completed",
									user_id : resData.user_id,
									move_status : 1,
									address_info : withRes.address_info,
								};
								deposit.create(depositData, function(verierr,veriRes) {
									if(veriRes) {
										helpingLib.findUserBalance(resData.user_id, withRes.currency,(finBal) => {
											let newbal = finBal + +withRes.transfer_amount
											helpingLib.updateUserBalance(resData.user_id, withRes.currency, newbal,(newbal1) => {
												if(newbal1) {
													withdraw.updateOne({_id : mongoose.mongo.ObjectId(info._id)},{$set:{reference_no:txid, admin_id:adminEmail, status:"completed", updated_at:new Date()}}).exec(function(upErr,upRes) {
														if(upRes.modifiedCount == 1) {
															let obj = { type:'Withdraw Fees', user_id:withRes.user_id, currency:withRes.currency, amount:withRes.fee_amt };
															if(withRes.fee_amt > 0) {
																profitDb.create(obj, function (err, data) {});
															}
															res.json({ status:true, msg:"Withdraw Updated successfully", admin_id:adminEmail, txnid:txid});				
														} else {
															res.json({ status:false, msg:"Something went wrong, Please try again later" });
														}
													})	
												}										
											});
										});
									}
								});
							} else {
								var args = { data: {currency:withRes.currency, amount:withRes.transfer_amount, address:withRes.address_info, tag:withRes.address_tag, network:withRes.network}, headers: {"Content-Type":"application/json"}};
								restCli.post("http://172.31.45.154/api/withdraw", args, function (resData, response) {
									if(resData.status == 1) {
										var txid = resData.result;
										withdraw.updateOne({_id : mongoose.mongo.ObjectId(info._id)},{$set:{reference_no:txid, admin_id:adminEmail, status:"completed", updated_at:new Date()}}).exec(function(upErr,upRes) {
											if(upRes) {
												let obj = { type:'Withdraw Fees', user_id:withRes.user_id, currency:withRes.currency, amount:withRes.fee_amt };
												if(withRes.fee_amt > 0) {
													profitDb.create(obj, function (err, data) {});
												}
												res.json({ status:true, msg:"Withdraw Updated successfully", admin_id:adminEmail, txnid:txid});				
											} else {
												res.json({ status:false, msg:"Something went wrong, Please try again later" });
											}
										})
									} else {
										return res.json({success:0, msg:"Failed to withdraw" });
									}
								});
							}
						});
					}
					else {
						res.json({ status:false, msg:"Something went wrong, Please try again later" });
					}
				})
			} else {
				res.json({status:false, msg:"Invalid request"});
			}
		});
	} else {
		res.json({ status:false, msg:"Something went wrong, Please try again later" });
	}
});

module.exports = router;