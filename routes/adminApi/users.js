const express = require('express');
const router = express.Router();
const async  = require('async');
const mongoose = require('mongoose');
const moment = require('moment');
const ipInfo = require("ipinfo");
const useragent = require('useragent');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const validator = require('validator');
const encdec = require('../../helpers/newendecryption');
const helpingLib = require('../../helpers/common');
const mail     = require('../../helpers/mail');
const Attempts = require('../../model/loginAttempts');
const notify  = require('../../model/notify');
const users = require('../../model/users');
const user_bank = require('../../model/userbank');
const userhis = require('../../model/userhistory');
const wallet = require('../../model/userWallet');
const referralDB = require('../../model/referral');
const orderDB = require('../../model/CoinOrder');
const userbank = require('../../model/userbank');
const currency = require('../../model/currency');
const admin = require('../../model/admin');
const business = require('../../model/business');

let response = {};

let updatedDate = () => { return new Date(); };

/* GET users listing. */
router.post('/userlist', helpingLib.originMiddle, function(req, res, next) {
	var info = req.body;
	var type = info.selected;
	var kyc = 0;
	if(type == 2) {
		kyc = 1;
		type = undefined;
	} else if(type == 3) {
		kyc = 3;
	} else if(type == 4) {
		kyc = 2;
	} else if(type == 5) {
		type = 2;
	}
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
	var regex = new RegExp(filter, "i");
	// search
	var search = {};
	if(filter != "") {
		var fl = filter.toLowerCase();
		let ismail = validator.isEmail(fl);
		if(ismail) {
			var first = encdec.encryptNew(encdec.firstNewMail(fl));
			var second = encdec.encryptNew(encdec.secondNewMail(fl));
			if(type != undefined && (type == 0 || type == 1 || type == 2)){
				search = {status:type, primary_value:first, added_val:second};
			} else if(kyc != 0){
				search = {kyc_status:kyc, primary_value:first, added_val:second};
			} else {
				search = {primary_value:first, added_val:second};
			}
		} else {
			if(type != undefined && (type == 0 || type == 1 || type == 2)){
				search = {status:type, username:regex};
			} else if(kyc != 0){
				search = {kyc_status:kyc, username:regex};
			} else {
				search = { $or: [ { username: regex }, { country: regex } ] };
			}
		}
	} else if(type != undefined && (type == 0 || type == 1 || type == 2)) {
		search = {status:type};
	} else if(kyc != 0){
		search = {kyc_status:kyc};
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
		usersCount:function(cb) {
			users.find(search).countDocuments().exec(cb)
		},
		usersData:function(cb) {
			users.find(search, {username:1, primary_value:1, added_val:1, status:1, kyc_status:1, created_at:1, tfa_status:1, id_status:1, selfie_status:1, addr_status:1, email:1, country:1}, query).sort({'created_at': -1 }).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		response.status = true;
		response.data = results.usersData;
		for(i=0; i<response.data.length; i++){
			let first = response.data[i].primary_value.replace("dllteusr-", "");
			let second = response.data[i].added_val.replace("dllteusr-", "");
			response.data[i].username = response.data[i].username.replace("dllteusr-", "");
			if(first != '' && second != '') {
				response.data[i].email = encdec.decryptNew(first)+encdec.decryptNew(second);
			} else {
				response.data[i].email = '';
			}
		}
		response.userCount = results.usersCount;
		res.json(response);
	})
});

router.post('/userbank', helpingLib.originMiddle, function(req, res, next) {
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
		search['$or'] = [{'currency': regex}, {'acc_name': regex},{'acc_number': regex},{'acc_type': regex},{'bank_name': regex},{'bank_branch': regex},{'bank_code': regex}];
	}
	async.parallel({
		userBankCount:function(cb) {
			userbank.find(search).countDocuments().exec(cb)
		},
		userBankData:function(cb) {
			userbank.find(search, { currency:1,acc_name:1,acc_number:1,acc_type:1,bank_name:1,bank_branch:1,bank_code:1,bank_proof:1,status:1,created_at:1 }, query).sort({'updated_at': -1 }).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		response.status = true;
		response.data = results.userBankData;
		response.userCount = results.userBankCount;
		res.json(response);
	})
});

router.post('/status', helpingLib.originMiddle, (req,res) => {
	let info = req.body;
	let sts = (info.status == 1) ? 2 : 1;
	let obj = { "status":sts, "modifiedDate":updatedDate() };
	var encuId = encdec.encryptNew(info._id.toString());
	users.findOneAndUpdate({ "_id": info._id},{ "$set": obj },{multi: true}).exec(function(err, resUpdate){
		if(resUpdate) {
			orderDB.updateMany({$and:[{'user_id':info._id}, {$or:[{'status':'partially'},{'status':'active'}]}]}, {$set:{'status':'blockedorder'}},function(actErr,actRes){})
			// orderDB.updateMany({user_id:info._id, status:'active'}, {$set:{status:'blockactive'}}, function(actErr,actRes){});
			// orderDB.updateMany({user_id:info._id, status:'partially'}, {$set:{status:'blockpartially'}}, function(parErr,parRes){});
			response = {status:true, msg:"Successfully updated", token:encodeURIComponent(encuId)};
		} else {
			response = {status:false, msg:"Invalid request. Please try again"};
		}
		res.json(response);	
	});
});

router.post('/tfaCngStatus', helpingLib.originMiddle, (req,res) => {
	let info = req.body;
	let usermail;
	var tfa_access = info.tfa_access;
	if(tfa_access == 'true'){
		users.findOne({ "_id": info._id}).exec(function(error, resData){
			usermail = encdec.decryptNew(resData.primary_value)+encdec.decryptNew(resData.added_val);
			var qrName = `GS20Exchange (${usermail})`;
			var secret = speakeasy.generateSecret({ length:10, name:qrName });
			var tfaCode = secret.base32;
			var tfaUrl = secret.otpauth_url;
			var url = tfaUrl.replace(tfaCode, "");
			var obj = { tfa_status:0, tfa_code:encdec.withEncrypt(tfaCode), tfa_url:url, tfa_update:updatedDate() };
			users.updateOne({"_id":info._id}, {"$set":obj}).exec(function(err, resUpdate){
				if(resUpdate) {
					var to = usermail;
					var specialVars = {
						'###USERNAME###' : resData.username,	
						'###USER###' : resData.username,
						'###STATUS###' : 'disabled by admin',	      
						'###UPDATED_AT###': moment().format('ll')
					};
	        // mail.sendMail(usermail,'notify_tfa',specialVars,function(mailRes){});
	        response = {status:true, msg:"Successfully updated"};
	    } else {
	    	response = {status:false, msg:"Invalid request. Please try again"};
	    }
	    res.json(response);	
	});
		});
	} else {
		response = { status:false, msg:"Invalid request. Please try again"};
		res.json(response);
	}
});

router.get('/viewusers/:id', helpingLib.tokenMiddleware, (req,res) => {
	var id = req.params.id;
	users.findOne({"_id": id}).exec(function(error,resData){
		if(resData){
			resData.email = encdec.decryptNew(resData.primary_value) + encdec.decryptNew(resData.added_val);	
			let obj ={ "_id":resData._id, "username":resData.username, "email": resData.email, "firstname":resData.firstname, "lastname":resData.lastname, "gender":resData.gender, "dob":resData.dob, "address":resData.address, "city":resData.city, "state":resData.state, "country":resData.country, "phone":resData.phone, "profile_pic":resData.profile_pic, "id_proof":resData.id_proof, "addr_proof":resData.addr_proof, "selfie_proof": resData.selfie_proof, "id_status":resData.id_status, "addr_status":resData.addr_status, "selfie_status":resData.selfie_status, "kyc_status": resData.kyc_status, "acc_type": resData.acc_type , "zipcode": resData.zipcode, "buss_address": resData.buss_address, "reg_country": resData.reg_country, "legal": resData.legal, "wealth": resData.wealth, "funds": resData.funds, "contact_name": resData.contact_name };
			res.json({status : true, data : obj});
		} else {
			res.json({status : false, msg : "Invalid request. Please try again"});
		}
	})
});

router.get('/getBusinessInfo/:id', helpingLib.tokenMiddleware, (req,res) => {
	var id = req.params.id;
	business.findOne({user_id: id}).exec(function(error,resData){
		if(resData){
			res.json({status : true, data : resData});
		} else {
			res.json({status : false, msg : "Invalid request. Please try again"});
		}
	})
});

router.post('/updateKyc', helpingLib.originMiddle, (req,res) => {
	let info = req.body;
	let setStatus; let proof_type;
	if(info.proof == 2) { 
		proof_type = 'Selfie proof';
		setStatus = {selfie_status : 3}
	} else if(info.proof == 3) { 
		proof_type = 'Address proof';
		setStatus = {addr_status : 3}
	} else if(info.proof == 1) {
		proof_type = 'ID proof';
		setStatus = {id_status : 3}
	}
	users.updateOne({"_id":info._id}, {"$set":setStatus}, {multi:true}).exec(function(err, resUpdate){
		if(resUpdate.nModified == 1) {
			users.findOne({_id:info._id}).select({id_status:1, addr_status:1, selfie_status:1, primary_value:1, added_val:1, username:1, referrer_id:1}).exec(function(userErr,userRes){
				if(userRes.selfie_status == 3 && userRes.addr_status == 3 && userRes.id_status == 3 ){
					users.findByIdAndUpdate({_id:info._id}, {$set:{kyc_status:3, updated_at:updatedDate()}}, {multi:true}).exec(function(kycErr,kycRes) {
						if(kycRes) {
							var note = {'user_id':info._id, 'message':"Your "+ proof_type +" has been approved by admin", 'category':'KYC Status'}
							notify.create(note, function (err, postRes) { });
							res.json({status:true});
						}
					});
				} else {
					res.json({status:true});
				}
			});
		} else {
			res.json({status:false});
		}
	});
});

router.post('/updateKyb', helpingLib.originMiddle, (req,res) => {
	let info = req.body;
	let setStatus; let proof_type;
	if(info.proof == 1) { 
		proof_type = 'Certificate of Incorpration';
		setStatus = {proof_status1 : 3}
	} else if(info.proof == 2) { 
		proof_type = 'Memorandum & Articles Of Association/Constitution/By-Laws';
		setStatus = {proof_status2 : 3}
	} else if(info.proof == 3) { 
		proof_type = 'Proof of Business address';
		setStatus = {proof_status3 : 3}
	} else if(info.proof == 4) { 
		proof_type = 'Corporate Account Details';
		setStatus = {proof_status4 : 3}
	} else if(info.proof == 5) { 
		proof_type = 'Company Structure Charts';
		setStatus = {proof_status5 : 3}
	} else if(info.proof == 6) { 
		proof_type = 'Evidence Of Source of Wealth';
		setStatus = {proof_status6 : 3}
	} else if(info.proof == 7) { 
		proof_type = 'Evidence Of Source of Funds';
		setStatus = {proof_status7 : 3}
	} 
	business.updateOne({user_id:info._id}, {"$set":setStatus}, {multi:true}).exec(function(err, resUpdate){
		if(resUpdate.nModified == 1) {
			business.findOne({user_id:info._id}).select({proof_status1:1, proof_status2:1, proof_status3:1, proof_status4:1, proof_status5:1, proof_status6:1, proof_status7:1}).exec(function(userErr,userRes){
				var note = {'user_id':info._id, 'message':"Your "+ proof_type +" has been approved by admin", 'category':'KYC Status'}
				notify.create(note, function (err, postRes) { });
				if(userRes.proof_status1 == 3 && userRes.proof_status2 == 3 && userRes.proof_status3 == 3 && userRes.proof_status4 == 3 &&  userRes.proof_status5 == 3 && userRes.proof_status6 == 3 && userRes.proof_status7 == 3){
					users.findByIdAndUpdate({_id:info._id}, {$set:{kyc_status:3, updated_at:updatedDate()}}, {multi:true}).exec(function(kycErr,kycRes) {
						if(kycRes) {
							res.json({status:true});
						}
					});
				} else {
					res.json({status:true});
				}
			});
		} else {
			res.json({status:false});
		}
	});
});

router.post('/rejectKYB', helpingLib.originMiddle, (req,res) => {
	let info = req.body;
	let setStatus; let proof_type;

	if(info.proof == 1) { 
		proof_type = 'Certificate of Incorpration';
		setStatus = {proof_status1 : 2, proof_reject1 : info.reason, step3_status: 0, updated_at: updatedDate()}
	} else if(info.proof == 2) { 
		proof_type = 'Memorandum & Articles Of Association/Constitution/By-Laws';
		setStatus = {proof_status2 : 2, proof_reject2 : info.reason, step3_status: 0, updated_at: updatedDate()}
	} else if(info.proof == 3) { 
		proof_type = 'Proof of Business address';
		setStatus = {proof_status3 : 2, proof_reject3 : info.reason, step3_status: 0, updated_at: updatedDate()}
	} else if(info.proof == 4) { 
		proof_type = 'Corporate Account Details';
		setStatus = {proof_status4 : 2, proof_reject4 : info.reason, step3_status: 0, updated_at: updatedDate()}
	} else if(info.proof == 5) { 
		proof_type = 'Company Structure Charts';
		setStatus = {proof_status5 : 2, proof_reject5 : info.reason, step3_status: 0, updated_at: updatedDate()}
	} else if(info.proof == 6) { 
		proof_type = 'Evidence Of Source of Wealth';
		setStatus = {proof_status6 : 2, proof_reject6 : info.reason, step3_status: 0, updated_at: updatedDate()}
	} else if(info.proof == 7) { 
		proof_type = 'Evidence Of Source of Funds';
		setStatus = {proof_status7 : 2, proof_reject7 : info.reason, step3_status: 0, updated_at: updatedDate()}
	} 
	business.updateOne({user_id: info._id},{ "$set": setStatus },{multi: true}).exec(function(err, resUpdate){
		if(resUpdate) {
			users.findOneAndUpdate({_id:info._id}, {$set:{kyc_status:2, updated_at:updatedDate()}}, {multi:true}).exec(function(kycErr,kycRes) {
				var to = encdec.decryptNew(kycRes.primary_value)+encdec.decryptNew(kycRes.added_val);
				var specialVars = {
					'###USER###': kycRes.username,
					'###TYPE###': proof_type,
					'###REASON###': 'REASON: '+info.reason,
					'###STATUS###': 'Rejected',
					'###UPDATED_AT###': moment().format('ll')
				};
				// mail.sendMail(to,'kyc_verify',specialVars,function(mailRes){ });
				var note = {'user_id':info._id, 'message':"Your " + proof_type +" has been rejected by admin", 'category':'KYC Status'}
				notify.create(note, function (err, postRes) { });
				response = {status : true, msg : "Successfully updated"};
			});
		} else {
			response = {status : false, msg : "Invalid request. Please try again"};
		}
		res.json(response);	
	});
});

var mapReferral = function() {};
let _referMap = new mapReferral();

router.post('/getReferral', helpingLib.originMiddle, (req, res) => {
	try {
		let info = req.body;
		users.findOne({_id:info._id},{refer_id:1}).exec(function(userErr, userRes) {
			if(userRes) {
				users.find({referrer_id:userRes.refer_id},{username:1, refer_id:1, status:1, primary_value:1, added_val:1, kyc_status:1, created_at:1}).exec(function(levelErr, levelRes) {
					if(levelRes.length != 0) {
						response.data = [];
						response.refer = [];
						var inc = 0;
						_referMap.getReferralLevelTwo(levelRes, inc, (resTwo) => {
							for(i=0;i<levelRes.length;i++){
								let first  = levelRes[i].primary_value;
								let second = levelRes[i].added_val;
								var nn = {
									email: encdec.decryptNew(first)+encdec.decryptNew(second),
									level: "Level 1",
									username: levelRes[i].username,
									status: levelRes[i].status,
									kyc_status: levelRes[i].kyc_status,
									refer_id: levelRes[i].refer_id,
									_id: levelRes[i]._id
								}
								response.refer.push(nn)
							}
							for(i=0;i<resTwo.length;i++){
								let first  = resTwo[i].primary_value;
								let second = resTwo[i].added_val;
								var nn = {
									email: encdec.decryptNew(first)+encdec.decryptNew(second),
									level: "Level 2",
									username: resTwo[i].username,
									status: resTwo[i].status,
									kyc_status: resTwo[i].kyc_status,
									refer_id: resTwo[i].refer_id,
									_id: resTwo[i]._id
								}
								respData = []
								response.refer.push(nn)
							}
							res.json({status:true, data:response.refer})
						})
					} else {
						res.json({status:true, message:"No Records"})
					}
				})
			} else {
				res.json({status:true, message:"No Records"})
			}
		})
	} catch(e) {
		res.json({status: false, message:"Something went wrong"})
	}
})

var respData = [];
mapReferral.prototype.getReferralLevelTwo = function (data, inc, callback) {
	var info = data[inc];
	users.find({referrer_id:info.refer_id},{username:1, refer_id:1, status:1, primary_value:1, added_val:1, kyc_status:1, created_at:1}).exec(function(levelErr, levelRes) {
		if(levelRes.length != 0) {
			for(var i=0; i<levelRes.length; i++) {
				respData.push(levelRes[i])
			}
			if(inc < data.length-1) {
				inc++
				_referMap.getReferralLevelTwo(data, inc, callback)
			} else {
				callback(respData)
			}
		} else {
			if(inc < data.length-1) {
				inc++
				_referMap.getReferralLevelTwo(data, inc, callback)
			} else {
				callback(respData)
			}
		}
	})
}

router.post('/userReferral', helpingLib.originMiddle, (req, res) => {
	try {
		var info = req.body;
		var filter = info.filter || '';
		var counts = {"level1":0, "level2":0, "level3":0, "level4":0, "level5":0, "level6":0, "level7":0, "level8":0, "level9":0, "level10":0, "level11":0, "level12":0, "level13":0, "level14":0, "level15":0};
		res.json({status:true, data:[], counts:counts});
	} catch(e) {
		res.json({status:false, message:"Something went wrong"})
	}
});

router.post('/updateReferral', helpingLib.originMiddle, (req, res) => {
	try {
		var info = req.body;
		let usrmail   = info.email.toLowerCase();
		var first = encdec.encryptNew(encdec.firstNewMail(usrmail));
		var second = encdec.encryptNew(encdec.secondNewMail(usrmail));
		users.findOne({primary_value:first, added_val:second},{_id:1,referrer_id:1}).exec(function(err, find) {
			if(find) {
				users.findOne({_id:info._id},{refer_id:1}).exec(function(refErr, refRes) {
					users.updateOne({_id:find},{$set:{referrer_id:refRes.refer_id}}).exec(function(upErr, upRes) {
						if(upRes.nModified == 1) {
							res.json({status: true, message:"Referral Updated Successfully"})
						}
					})
				})
			} else {
				res.json({status: false, message:"User Not Found!"})
			}
		})
	} catch(e) {
		res.json({status: false, message:"Something went wrong"})
	}
})

router.post('/rejectKYC', helpingLib.originMiddle, (req,res) => {
	let info = req.body;
	let setStatus; let proof_type;
	if(info.proof == 2) { 
		proof_type = 'Selfie proof';
		setStatus = {selfie_status:2, selfie_reject:info.reason, kyc_status:2, updated_at:updatedDate() }
	} else if(info.proof == 3) { 
		proof_type = 'Address proof';
		setStatus = {addr_status:2, addr_reject:info.reason, kyc_status:2, updated_at:updatedDate() }
	} else if(info.proof == 1) { 
		proof_type = 'ID proof';
		setStatus = {id_status:2, id_reject:info.reason, kyc_status:2, updated_at:updatedDate()}
	}
	users.findOneAndUpdate({_id:info._id}, {"$set":setStatus},{multi: true}).exec(function(err, resUpdate){
		if(resUpdate) {
			var to = encdec.decryptNew(resUpdate.primary_value)+encdec.decryptNew(resUpdate.added_val);
			var specialVars = {
				'###USER###': resUpdate.username,
				'###TYPE###': proof_type,
				'###REASON###': 'REASON: '+info.reason,
				'###STATUS###': 'Rejected',
				'###UPDATED_AT###': moment().format('ll')
			};
			// mail.sendMail(to,'kyc_verify',specialVars,function(mailRes){ });
			var note = {'user_id':info._id, 'message':"Your " + proof_type +" has been rejected by admin", 'category':'KYC Status'}
			notify.create(note, function (err, postRes) { });
			response = {status : true, msg : "Successfully updated"};
		} else {
			response = {status : false, msg : "Invalid request. Please try again"};
		}
		res.json(response);	
	});
});

//getlist of users
router.get('/getusers', helpingLib.originMiddle, (req,res) => {
	users.find({}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });		
	})
});

//get active users
router.get('/getactiveusers', helpingLib.originMiddle, (req,res) => {
	users.find({status:1}).exec(function(error,actData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : actData });		
	})
});

//get deactive users
router.get('/getdeactiveusers', helpingLib.originMiddle, (req,res) => {
	users.find({status:0}).exec(function(error,deactData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : deactData });		
	})
});


//getlist of user bank
router.post('/getBanks', helpingLib.originMiddle, (req,res) => {
	let info = req.body;
	user_bank.find({user_id: info._id}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });		
	})
});

router.post('/loghistory', helpingLib.originMiddle, function(req, res, next) {
	var info = req.body;	
	var filter = info.filter || '';
	var ftype = info.ftype || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var size = parseInt(info.pageSize);
	var sortName = info.sortActive;
	var srt   = {}
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var sort  = srt;
	var skip  = size * pageNo;
	var limit = size;
	// search
	var search= {};
	var regex = new RegExp(filter, "i");
	if(filter != "" && ftype != "") {
		if(ftype == "ip") {
			search = {'ip_address':regex};
		} else {
			var fl = filter.toLowerCase();
			let ismail = validator.isEmail(fl);
			if(ismail) {
				var first = encdec.encryptNew(encdec.firstNewMail(fl));
				var second = encdec.encryptNew(encdec.secondNewMail(fl));
				search = {'users.primary_value':first, 'users.added_val':second};
			} else {
				search = {'users.username':regex};
			}
		}
		async.parallel({
			logCount:function(cb) {	
				userhis.aggregate([{
					$lookup: {
						from: "user_info",
						localField: "user_id",
						foreignField: "_id",
						as: "users"
					}},
					{ $match : search },
					{ $group: { _id: null, count: { $sum: 1 } } }
					]).exec(cb)
			},		
			logData:function(cb) {
				userhis.aggregate([
				{
					$lookup: {
						from: "user_info",
						localField: "user_id",
						foreignField: "_id",
						as: "users"
					}
				},
				{ $match: search },
				{
					$project : {
						"_id":0,						
						"primary_value": {$arrayElemAt:["$users.primary_value",0]},
						"added_val": {$arrayElemAt:["$users.added_val",0]},
						"ip_address": "$ip_address",
						"browser": "$browser",
						"deviceinfo": "$deviceinfo",
						"created_at": "$created_at"
					}
				},
				{ "$sort": sort },
				{ "$skip": skip },
				{ "$limit": limit }
				]).exec(cb) 
			},
		},function(err,results) {
			if (err) return res.status(500).send(err);
			let	resData  = results.logData;
			for(i=0; i<resData.length; i++){
				let first = resData[i].primary_value;
				let second = resData[i].added_val;
				if(first != "" && first != undefined && second != "" && second != undefined) {
					resData[i].email = encdec.decryptNew(first)+encdec.decryptNew(second);
				} else {
					resData[i].email = "";
				}
			}
			response.status = true;
			response.data = resData;
			if(results.logCount.length > 0) {
				response.logCount = results.logCount[0].count;
			} else {
				response.logCount = 0;
			}
			res.json(response);
		});	
	} else {
		response.status = true;
		response.data = [];
		response.logCount = 0;
		res.json(response);
	}	
});

router.post('/login_attempt', helpingLib.originMiddle, function(req, res, next) {
	var info = req.body;	
	var filter = info.filter || '';
	var pageNo = parseInt(info.pageIndex) || 0;
	var sortOrder = info.sortOrder;
	var size = parseInt(info.pageSize);
	var sortName = info.sortActive;
	var srt   = {}
	srt[sortName] = (sortOrder == 'desc') ? -1 : 1;
	var query = {};
	var sort  = srt;
	var skip  = size * pageNo;
	var limit = size;
	// search
	var search= {};
	var regex = new RegExp(filter, "i");
	let one   = encdec.encryptNewEmail(filter);
	if(filter !="") {
		if(moment(new Date(filter), "YYYY-MM-DD h:mm:ss").isValid()) {
			var newDate = "";
			var newDate1 = "";
			var searchDate = new Date(filter);
			var srdate = new Date(filter);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();																
			search = {$or:[{'ip_address': regex},{'emailid': regex}, {'browser': regex},{'deviceinfo': regex},{'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}}]};
		} else{
			search = {$or:[{'ip_address': regex}, {'browser': regex},{'deviceinfo': regex},{'emailid': regex}]};
		}								 
	} else {
		search = {$or:[{'ip_address': regex}, {'browser': regex},{'deviceinfo': regex},{'emailid': regex}]};	
	}
	async.parallel({
		logCount:function(cb) {
			Attempts.find(search).countDocuments().exec(cb)
		},
		logData:function(cb) {				
			Attempts.find(search, {ip_address:1,emailid:1,browser:1,attemptCount:1,deviceinfo:1,created_at:1,status:1 }, query).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		let	resData  = results.logData;		
		response.status   = true;
		response.data     = resData;
		response.logCount = results.logCount;
		res.json(response);
	});	
});

/* GET referral list. */
router.post('/referrallist', helpingLib.originMiddle, function(req, res, next) {
	var info = req.body;
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

	var search = {};
	var filter = info.filter
	var newDate = "";
	var findDate = "";
	if(moment(new Date(filter), "YYYY-MM-DD h:mm:ss").isValid()) {
		var searchDate = new Date(filter);
		var srdate = new Date(filter);
		searchDate.setDate( searchDate.getDate());
		srdate.setDate( srdate.getDate() + 1 ); 
		newDate = searchDate.toISOString();
		findDate = srdate.toISOString();
	}
	if(filter != "") {
		search = {$or:[
			{'username': { $regex: '.*' + filter + '.*',$options: 'i' }},
			{'refer_name': { $regex: '.*' + filter + '.*',$options: 'i' }},
			{'currency':{ $regex: '.*' + filter + '.*',$options: 'i' }},
			{'type':{ $regex: '.*' + filter + '.*',$options: 'i' }},
			]};
		}
		if((newDate) && (findDate)) {
			search = {$or:[{'created_at':{ $gte: new Date(newDate), $lt: new Date(findDate)}}]};
		}
		async.parallel({
			usersCount:function(cb) {
				referralDB.find(search).countDocuments().exec(cb)
			},
			usersData:function(cb) {
				referralDB.find(search).limit(query.limit).skip(query.skip).sort(query.sort).exec(cb)
			},
		},function(err,results){
			if (err) return res.status(500).send(err);
			response.status     = true;
			response.data       = results.usersData;
			response.userCount = results.usersCount;
			res.json(response);
		})
	});

router.post('/updateBalance', helpingLib.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	admin.findOne({"_id":req.userId}).exec(function(err,resData){
		if(resData) {
			if(resData.tfa_status == 1) {
				var verified = speakeasy.totp.verify({
					secret  : resData.tfa_code,
					encoding: 'base32',
					token   : info.tfa_code,
					window  : 1
				});
				if(verified == true){
					var userId = info._id;
					var wallet = info.balance;
					currency.find({status:1}, {_id:0,symbol:1}).exec(function(curErr,curRes){
						if (curErr) {
							return next(curErr);
						}
						for(i=0; i<curRes.length; i++){
							var curr = curRes[i].symbol;
							var balance = wallet[curr];
							helpingLib.updateUserBalance(userId, curr, balance, function(up){
							});
						}	
						res.json({status : true, message : 'Updated Successfully' });	
					});
				} else {
					res.json({ status:false, message:"Invalid 2FA Code" });
				}
			} else {
				res.json({ status:false, message:"Enable your 2FA" });
			}
		}
	});
});

module.exports = router;