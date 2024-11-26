const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const async = require('async');
const validator = require('validator');
let moment = require('moment');
const ipInfo = require("ipinfo");
const useragent = require('useragent');
const speakeasy = require('speakeasy');
var Client = require('node-rest-client').Client;
var restCli = new Client();

const common = require('../../helpers/common');
const encdec = require('../../helpers/newendecryption');
const cloudinary = require('../../helpers/cloudinary');
const mail = require('../../helpers/mail');

//schemas load
const users = require('../../model/users');
const wallet = require('../../model/userWallet');
const settings = require('../../model/siteSettings');
const country = require('../../model/country');
const userhis = require('../../model/userhistory');
const notify = require('../../model/notify');
const deposit = require('../../model/deposit');
const withdraw = require('../../model/withdraw');
const listCoin = require('../../model/listCoin');
const business = require('../../model/business');

//upload  storage
var storage = multer.diskStorage({
	filename: function (req, file, cb) {
		cb(null, common.randomString(8) + new Date().getTime() + file.originalname);
	}
});
var upload = multer({ storage: storage });

let response = {};
let updatedDate = () => { return new Date(); };

let middleware = () => {
	return common.tokenMiddleware;
}

router.get('/getUserId', common.tokenMiddleware, (req, res) => {
	res.json({ status:true, UserId: req.userId })
})

router.get('/header', common.checkUserId, (req, res) => {
	if(req.userId != 0) {
		users.findOne({"_id": req.userId},{_id:0, profile_pic:1, kyc_status:1}).exec(function(error,resData){
			if(resData){
				let obj = {"profile":resData.profile_pic,"kyc_status":resData.kyc_status};
				res.json({status:true, data:obj});
			} else {
				res.json({status:false, msg:"Invalid user"});
			}
		});
	} else {
		res.json({status:true, data:{"profile":"","kyc_status":0}});
	}
});

router.get('/prosts', common.userVerify, (req, res) => {
	users.findOne({"_id": req.userId},{_id:0, pro_status:1, kyc_status:1}).exec(function(error,resData){
		if(resData){
			let obj = {"status":resData.pro_status, "kycStatus":resData.kyc_status};
			res.json({status:true, data:obj});
		} else {
			res.json({status:false, msg:"Invalid user"});
		}
	});
});

router.get('/userinfo', common.userVerify, (req,res) => {
	try {
		let userId = req.userId;
		async.parallel({
			UserInfo:function(cb) {
				users.findOne({"_id": userId}).select("username primary_value added_val tfa_status kyc_status pro_status").exec(cb)
			},	
		},function(err,results){
			if (err) return res.status(500).send(err);
			let resData = results.UserInfo;
			if(resData){
				resData.email=encdec.decryptNew(resData.primary_value)+encdec.decryptNew(resData.added_val);
				let obj = {"Name":resData.username, "email_id":resData.email, "t_sts":resData.tfa_status, "k_sts":resData.kyc_status, "pro_status":resData.pro_status};			
				let userinfo = {"profile":obj}
				res.json({status:true, data : userinfo });		
			} else {
				res.json({status:false, msg:"Invalid user"});
			}
		})
	} catch(e) {
		res.json({status:false, msg:"Something went wrong"});
	}
});

router.get('/get_withdraw', common.userVerify, (req, res) => {
	withdraw.find({"user_id": req.userId},{_id:0, amount:1, currency:1, reference_no:1, fee_amt:1, status:1, created_at:1}).sort({created_at:-1}).exec(function(error,resData){
		if(resData){
			res.json({status:true, data:resData});
		} else {
			res.json({status:false, msg:"Invalid user"});
		}
	});
});

router.get('/get_deposit', common.userVerify, (req, res) => {
	deposit.find({"user_id": req.userId},{_id:0, amount:1, currency:1, reference_no:1, status:1, created_at:1}).sort({created_at:-1}).exec(function(error,resData){
		if(resData){
			res.json({status:true, data:resData});
		} else {
			res.json({status:false, msg:"Invalid user"});
		}
	});
});

router.get('/userHis', common.userVerify, (req,res) => {
	let userId = req.userId;	
	async.parallel({
		DepHis:function(cb) {
			deposit.find({"user_id":userId},{_id:0, amount:1, currency:1, reference_no:1, status:1, created_at:1}).sort({"created_at": -1}).limit(5).exec(cb)			
		},
		WithHis:function(cb) {
			withdraw.find({"user_id":userId},{_id:0, amount:1, currency:1, reference_no:1, fee_amt:1, status:1, created_at:1}).sort({"created_at": -1}).limit(5).exec(cb)
		},
	},function(err,results ){
		if (err) {return res.status(500).send(err)};
		let userHis = {"withhis": results.WithHis}
		res.json({status:true, data : userHis });
	})
});

router.get('/profile_info', common.userVerify, (req,res) => {
	let id = req.userId;
	users.findOne({"_id":id}, {_id:0, protect_key:0, created_at:0, updated_at:0, user_fav:0, secretkey:0, ip_address:0, email_otp:0, forgot_code:0, referrer_id:0, refer_id:0, id_proof:0, addr_proof:0, id_proof1:0, selfie_proof:0}).exec(function(error,resData) {
		if (error) {
			res.json({status:false, msg:"Invalid request" });
		}
		if(resData) {
			var strData = JSON.stringify(resData);
			var parData = JSON.parse(strData);
			parData['show_pass'] = (parData['with_pass'] == "") ? 1 : 0;
			var usermail = encdec.decryptNew(parData['primary_value']) + encdec.decryptNew(parData['added_val']);
			delete parData['primary_value'];delete parData['added_val'];delete parData['with_pass'];
			parData['email'] = usermail;
			upTfaCode(id, parData, usermail, function(resp) {
				res.json({status:true, user:resp});
			})
		}
	});
});


router.get('/business_info', common.userVerify, (req,res) => {
	let id = req.userId;
	business.findOne({user_id:id}, {_id:0}).exec(function(error,resData) {
		if (error) {
			res.json({status:false, msg:"Invalid request" });
		}
		if(resData) {
			if(resData.dir == undefined){resData.dir = []};
			if(resData.own == undefined){resData.own = []};
			if(resData.res == undefined){resData.res = []};
			if(resData.leg == undefined){resData.leg = []};
			if(resData.additionalData == undefined){resData.additionalData = []};
			var businessName = [];
			if(resData.dir.length > 0){var IstarrName = resData.dir.map(function (obj) {return obj.username;});}
			else{var IstarrName = []}
			if(resData.own.length > 0){var IIstarrName = resData.own.map(function (obj) {return obj.username;});}
			else{var IIstarrName = []}
			if(resData.res.length > 0){var IIIstarrName = resData.res.map(function (obj) {return obj.username;});}
			else{var IIIstarrName = []}
			businessName = businessName.concat(IstarrName, IIstarrName, IIIstarrName);
			ArrCon(resData.dir, '_dir', function(dirResData) {
				ArrCon(resData.own, '_own', function(ownResData) {
					ArrCon(resData.res, '_rep', function(repResData) {
						ArrCon(resData.leg, '_leg', function(legResData) {
							ArrCon(resData.additionalData, '_add', function(addResData) {
								let merged = {...dirResData, ...ownResData, ...repResData, ...legResData, ...addResData};
								merged.step1_status= resData.step1_status;
								merged.user_id= resData.user_id;
								merged.created_at= resData.created_at;
								merged.updated_at= resData.updated_at;
								merged.proof_status1= resData.proof_status1; merged.proof_status2= resData.proof_status2; merged.proof_status3= resData.proof_status3; merged.proof_status4= resData.proof_status4; merged.proof_status5= resData.proof_status5;merged.proof_status6= resData.proof_status6; merged.proof_status7= resData.proof_status7;
								merged.proof1= resData.proof1; merged.proof2= resData.proof2; merged.proof3= resData.proof3; merged.proof4= resData.proof4; merged.proof5= resData.proof5; merged.proof6= resData.proof6; merged.proof7= resData.proof7;
								merged.value1= resData.value1; merged.value2= resData.value2; merged.value3= resData.value3; merged.value4= resData.value4; merged.value5= resData.value5; merged.value6= resData.value6; merged.value7= resData.value7;merged.value8= resData.value8;merged.value9= resData.value9;
								merged.step2_name= resData.step2_name;
								merged.step2_status= resData.step2_status;
								merged.dirLan= resData.dir.length;
								merged.ownLan= resData.own.length;
								merged.resLan= resData.res.length;
								merged.legLan= resData.leg.length;
								merged.addLan= resData.additionalData.length;
								merged.business= businessName;
								merged.step0_status= resData.step0_status;
								merged.person= resData.person;
								merged.shares= resData.shares;
								merged.trustother= resData.trustother;
								merged.legother= resData.legother;

								res.json({status:true, business:merged});
							})
						})
					})
				})
			})
			// res.json({status:true, business:resData});
		}
	});
});

function ArrCon(ArrData, Lname, cb) {
	var obj = {}; 
	let i = 0;
	let len = ArrData.length;
	if(len !== 0) {
		ArrData.forEach((val)=>{
			if(Lname == '_add'){
				var key1 = 'name';
				var key2 = 'status';
				var key3 = 'note';
				if(val['legOpone'] !== undefined){var key4 = 'legOpone';}
				if(val['legOptwo'] !== undefined){var key5 = 'legOptwo';}
				if(val['shares'] !== undefined){var key6 = 'shares';}
				if(val['legother'] !== undefined){var key7 = 'legother';}
				if(val['trustother'] !== undefined){var key8 = 'trustother';}
				i=i+1
				obj[key1+i] = val[key1];
			   	obj[key2+i] = val[key2];
			   	obj[key3+i] = val[key3];
			   	if(val['legOpone'] !== undefined){obj[key4+i] = val[key4];}
			   	if(val['legOptwo'] !== undefined){obj[key5+i] = val[key5];}
			   	if(val['shares'] !== undefined){obj[key6+i] = val[key6];}
			   	if(val['legother'] !== undefined){obj[key7+i] = val[key7];}
			   	if(val['trustother'] !== undefined){obj[key8+i] = val[key8];}
			}else if(Lname == '_leg'){
				var key1 = 'dob';
				var key2 = 'image';
				var key3 = 'address';
				var key4 = 'code';
				i=i+1
				obj[key1+Lname+i] = val[key1];
			   	obj[key2+Lname+i] = val[key2];
			   	obj[key3+Lname+i] = val[key3];
			   	obj[key4+Lname+i] = val[key4];
			}else{
				var key1 = 'alpha_code';
				var key2 = 'username';
				var key3 = 'dob';
				var key4 = 'image';
				var key5 = 'type';
				var key6 = 'issuAlp';
				var key7 = 'country';
				var key8 = 'issuCountry';
				i=i+1
			   	obj[key1+Lname+i] = val[key7];
			   	obj[key2+Lname+i] = val[key2];
			   	obj[key3+Lname+i] = val[key3];
			   	obj[key4+Lname+i] = val[key4];
			   	obj[key5+Lname+i] = val[key5];
			   	obj[key6+Lname+i] = val[key8];
			   	obj[key7+Lname+i] = val[key1];
			   	obj[key8+Lname+i] = val[key6];
			}
		   	if(len == i){
		   		cb(obj);
		   	}
		})
	}else{
		cb(obj);
	}
}

router.get('/kyc_info', common.userVerify, (req,res) => {
	let id = req.userId;
	users.findOne({"_id":id}, {_id:0, primary_value:1, added_val:1, kyc_status:1, pro_status:1}).exec(function(error,resData) {
		if(resData) {
			if(resData.pro_status == 1) {
				let usermail = encdec.decryptNew(resData.primary_value) + encdec.decryptNew(resData.added_val);
				var args = { data: {email:usermail, user_id:id.toString()}, headers: {"Content-Type":"application/json"} };
				restCli.post("http://172.31.45.154/api/kycInfo", args, function (resData, response) {
				// restCli.post("http://127.0.0.1:8000/api/kycInfo", args, function (resData, response) {
					if(resData.status == 1) {
						res.json({success:1, token:resData.token});
					} else {
						res.json({success:0});
					}
				});
			} else {
				res.json({success:2});
			}
		} else {
			res.json({success:0});
		}
	});
});

router.post('/deleteAccount', common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	let validUser = validator.isMongoId(userId);
	if(!validUser) { return res.json({success:0, msg:"Invalid User"}); }
	users.findOne({_id:userId}, {_id:0, primary_value:1, added_val:1, username:1}).exec(function(error,resData) {
		if(resData) {
			let mail1 = "dllteusr-"+resData.primary_value;
			let mail2 = "dllteusr-"+resData.added_val;
			let usrnm = "dllteusr-"+resData.username;
			users.updateOne({_id:userId}, {"$set":{primary_value:mail1, added_val:mail2, username:usrnm, status:3}}).exec(function(upErr, upRes) {
				if(upRes) {
					res.json({success:1});
				} else {
					res.json({success:0, msg:"Failed to delete account"});
				}
			});
		} else {
			res.json({success:0, msg:"Invalid User"});
		}
	});
});

router.post('/updateKycStatus', common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	let ky = validator.isEmpty(info.status);
	if(ky) {
		res.json({success:0});
	} else {
		const stsArr = ["0", "1", "2", "3", "4"];
		if(stsArr.indexOf(info.status) > -1) {
			users.updateOne({_id:userId}, {"$set":{kyc_status:parseInt(info.status)}}).exec(function(upErr, upRes) {
				if(upRes) {
					res.json({success:1});
				} else {
					res.json({success:0});
				}
			});
		} else {
			res.json({success:0});
		}
	}
});

function upTfaCode(userId, parData, usermail, cb) {
	if(parData['tfa_code'] == "" && parData['tfa_url'] == "" ) {
		var qrName = `GS20Exchange (${usermail})`;
		var secret = speakeasy.generateSecret({length:10, name:qrName});
		var tfaCode = secret.base32;
		var tfaUrl = secret.otpauth_url;
		var url = tfaUrl.replace(tfaCode, "");
		var updateVal = { tfa_code:encdec.withEncrypt(tfaCode), tfa_url:url };
		users.updateOne({ "_id": userId},{ "$set": updateVal }).exec(function(err, resUpdate){
			if(resUpdate) {
				parData['tfa_code'] = tfaCode;
				parData['tfa_url'] = encdec.getQrUrl(tfaUrl);
				cb(parData);
			} else {
				cb(false);
			}
		});
	} else {
		var tfaCode = encdec.withDecrypt(parData['tfa_code']);
		var tfaUrl = parData['tfa_url']+tfaCode;
		parData['tfa_code'] = tfaCode;
		parData['tfa_url'] = encdec.getQrUrl(tfaUrl);
		cb(parData);
	}
}

function uploadcheck(req,callback) {
	var uploadImg = "";
	if(req.file != null && req.file != undefined && req.file.path != "") {
		cloudinary.uploadImage(req.file.path,function(imgRes){
			if(imgRes != undefined) {
				uploadImg = imgRes.secure_url;
				callback(uploadImg);
			} else {
				callback(uploadImg);
			}
		});
	} else {
		callback(uploadImg);
	}
}

router.post('/updateWithdrawPwd', common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	let pwdVal = validator.isEmpty(info.withdraw_pwd);
	if(pwdVal) {
		res.json({status:false, msg:"Enter withdraw security password"});
	} else {
		users.findOne({"_id": userId}).select("with_pass").exec(function(error, resData){						
			if(!resData){
				res.json({success:0, msg:'Invalid User'});
			} else {
				if(resData.with_pass == "") {
					var comPwd = userId.toString()+info.withdraw_pwd;
					encdec.hashPswd(comPwd, function(encPwd) {
						users.updateOne({_id:userId}, {"$set":{with_pass:encPwd}}).exec(function(upErr, upRes) {
							if(upRes) {
								let notObj = {user_id:userId, category:"Withdraw Password", message:"You have updated your withdraw password", page:"settings?type=security"};
								notify.create(notObj, function(notErr, notRes) {});
								res.json({success:1, msg:"Withdraw Password updated successfully"});
							} else {
								res.json({success:0, msg:"Failed to update password"});
							}
						});
					});
				} else {
					res.json({success:0, msg:'Withdraw password already set'});
				}
			}
		});
	}
});

router.post('/checkWithdrawPwd', common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	let pwdVal = validator.isEmpty(info.withdraw_pwd);
	if(pwdVal) {
		res.json({status:false, msg:"Enter withdraw security password"});
	} else {
		users.findOne({"_id":userId}).select("with_pass").exec(function(error, resData){						
			if(!resData){
				res.json({success:0, msg:'Invalid User'});
			} else {
				if(resData.with_pass != "") {
					var comPwd = userId.toString()+info.withdraw_pwd;
					encdec.comparePswd(comPwd, resData.with_pass, function(pwdRes) {
						if(pwdRes) {
							res.json({success:1});
						} else {
							res.json({success:0, msg:"Invalid withdraw password"});
						}
					});
				} else {
					res.json({success:0, msg:'Withdraw password not set'});
				}
			}
		});
	}
});

router.post('/updateProfile',upload.single('profile_pic'), common.userVerify, (req,res) => {
	let info = req.body;
	if(info.firstname==undefined || info.firstname=="") {return res.json({success:0, msg:"Enter firstname"});}
	if(info.lastname==undefined || info.lastname=="") {return res.json({success:0, msg:"Enter lastname"});}
	if(info.country==undefined || info.country=="") {return res.json({success:0, msg:"Select country"});}
	if(info.country_code==undefined || info.country_code=="") {return res.json({success:0, msg:"Select country code"});}
	if(info.dob==undefined || info.dob=="") {return res.json({success:0, msg:"Select dob"});}
	if(info.phone==undefined || info.phone=="") {return res.json({success:0, msg:"Enter phone"});}
	if(info.address==undefined || info.address=="") {return res.json({success:0, msg:"Enter address"});}
	/*if(info.state==undefined || info.state=="") {return res.json({success:0, msg:"Enter state"});}
	if(info.city==undefined || info.city=="") {return res.json({success:0, msg:"Enter city"});}*/
	if(info.zipcode==undefined || info.zipcode=="") {return res.json({success:0, msg:"Enter zipcode"});}
	if(info.gender==undefined || info.gender=="") {return res.json({success:0, msg:"Select gender"});}
	if(info.alpha_code==undefined || info.alpha_code=="") {return res.json({success:0, msg:"Invalid Request"});}
	var buss_address =  (info.buss_address==undefined || info.buss_address=="") ? '' : info.buss_address;
	var reg_country =  (info.reg_country==undefined || info.reg_country=="") ? '' : info.reg_country;
	var legal =  (info.legal==undefined || info.legal=="") ? '' : info.legal;
	var wealth =  (info.wealth==undefined || info.wealth=="") ? '' : info.wealth;
	var funds =  (info.funds==undefined || info.funds=="") ? '' : info.funds;
	var contact_name =  (info.contact_name==undefined || info.contact_name=="") ? '' : info.contact_name;
	let userId = req.userId;
	info.state= (info.state==undefined || info.state=='undefined') ? '' : info.state; 
	info.city= (info.city==undefined || info.city=='undefined') ? '' : info.city;
	users.findOne({$and:[{"_id":{$ne:userId}}, {"phone":info.phone}]},function(error,findRes) {
		if(findRes){
			return res.json({success:2, msg:'Phone number already exists'});
		} else {
			uploadcheck(req, function(uploadImg) {
				let obj = {
					"firstname" 	: info.firstname,
					"lastname"  	: info.lastname,
					"country"   	: info.country,
					"country_code"	: info.country_code,
					"alpha_code"  	: info.alpha_code,
					"dob"       	: info.dob,
					"phone"     	: info.phone,
					"address"   	: info.address,
					"state"     	: info.state,
					"city"      	: info.city, 
					"zipcode"     	: info.zipcode,
					"gender"      	: info.gender,
					"pro_status"	: 1,
					"buss_address"  : buss_address,
					"reg_country"   : reg_country,
					"legal"      	: legal,
					"wealth"      	: wealth,
					"funds"      	: funds,
					"contact_name"  : contact_name
				};
				if(uploadImg != null && uploadImg != undefined && uploadImg!="") {
					obj["profile_pic"] = uploadImg;
				} else {
					obj["profile_pic"] = info.profile_pic;
				}
				users.updateOne({ "_id": userId},{ "$set": obj }).exec(function(err, resUpdate){
					if(resUpdate) {
						response = {success:1, msg:"Successfully updated", data:obj.profile_pic};
					} else {
						response = {success:0, msg:"Invalid request. Please Try again"};
					}
					res.json(response);
				});
			});
		}
	});
});

router.post('/changepwd', common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	let compPwd = validator.equals(info.new_pwd, info.confirm_pwd);
	let match = validator.equals(info.current_pwd, info.new_pwd);
	let passArr = [];
	if(!compPwd) {
		res.json({status:false, msg:"Passwords not match"})
	} else if(match){
		res.json({status:false, msg:"New password should differ from your current password"});
	} else {
		users.findOne({"_id": userId}).select("protect_key username primary_value added_val notify_pwd secretkey tfa_code").exec(function(err,resdata){ 
			if(resdata){
				var verified = speakeasy.totp.verify({
					secret  : encdec.withDecrypt(resdata.tfa_code),
					encoding: 'base32',
					token   : info.tfa_code,
					window  : 1
				});
				if(verified == true) {
					encdec.comparePswd(info.current_pwd, resdata.protect_key, function(pwdRes) {
						if(pwdRes) {
							passArr = resdata.secretkey; 
							encdec.hashPswd(info.new_pwd, function(encPwd) {
								encdec.cmpreMultiPwd(info.new_pwd, passArr, function(cmpVal) {
									if(cmpVal == 1) {
										res.json({success:3, msg:"Password should not match with last five passwords"});
									} else {
										if(resdata.secretkey.length < 5){
											passArr.push(encPwd);
										} else {
											passArr.shift();
											passArr.push(encPwd);	
										}
										users.updateOne({_id:userId}, { "$set": {protect_key:encPwd, secretkey:passArr}}).exec(function(upErr,upRes) {
											if(upRes) {
												res.json({status:true, msg:"Password updated successfully"});
											} else {
												res.json({status:false, msg:"Failed to update password"});
											}
										});
									}
								})
							});
						} else {
							res.json({status:false, msg:"current password was wrong"});
						}
					});
				} else {
					res.json({status:false, msg:"Invalid TFA code"});
				}
			} else {
				res.json({status:false, msg:"Invalid User"});
			}
		});	
	}
});

/* security alert notify */
router.post('/setNotify', common.userVerify, (req,res) => {
	var info = req.body; 
	var userId=req.userId;
	users.findOneAndUpdate({ "_id":userId},{ "$set": {[req.body.notify] : info.val}}).exec(function(err, resUpdate){
		if(resUpdate) {
			return res.json({status:true,	data:info.val});
		} else {
			return res.json({status:false, msg:"Something went wrong. Please try again"});
		}
	});	
});

router.post('/updateKyc', upload.array('kycProof[]',12), common.userVerify, function(req, res, next) {
	try {
		let userId = req.userId;
		let info = req.body;
		users.findOne({"_id":userId}, {id_status:1, addr_status:1, selfie_status:1, _id:0, pro_status:1}).exec(function(err, resData) {
			if(resData) {
				if(resData.pro_status == 1) {
					uploadKyc(req, function(imgArray) {
						let obj = {};
						if(resData.id_status == 0 || resData.id_status == 2) {
							if(imgArray['id_proof'] != null && imgArray['id_proof'] != undefined) {
								obj["id_proof"] = imgArray['id_proof'];
								obj["id_status"] = 1;
							} else {
								obj["id_status"] = 4;
							}
						}
						if(resData.addr_status == 0 || resData.addr_status == 2) {
							if(imgArray['addr_proof'] != null && imgArray['addr_proof'] != undefined) {
								obj["addr_proof"] = imgArray['addr_proof'];
								obj["addr_status"] = 1;
							} else {
								obj["addr_status"] = 4;
							}
						}
						if(resData.selfie_status == 0 || resData.selfie_status == 2) {
							if(imgArray['selfie_proof'] != null && imgArray['selfie_proof'] != undefined) {
								obj["selfie_proof"] = imgArray['selfie_proof'];
								obj["selfie_status"] = 1;
							} else {
								obj["selfie_status"] = 4;
							}
						}
						if(obj.id_status == 4) {
							res.json({status:false, msg:"Please upload valid ID proof"});
						} else if(obj.addr_status == 4) {
							res.json({status:false, msg:"Please upload valid Address proof"});
						} else if(obj.selfie_status == 4) {
							res.json({status:false, msg:"Please upload valid Selfie proof"});
						} else if (obj.id_status == 1 || obj.addr_status == 1 || obj.selfie_status == 1) {
							obj["kyc_status"] = 1;
							users.updateOne({_id:req.userId}, {$set:obj}).exec(function(err,result){
								if(result){
									res.json({status:true, msg:"KYC submitted succesfully", data:obj});
								} else {
									res.json({status:false, msg:"Something went wrong. Please try again"});
								}
							});
						} else {
							res.json({status:false, msg:"Please upload valid documents"});
						}
					});
				} else {
					res.json({status:false, msg:"Please complete your profile"});	
				}
			} else {
				res.json({status:false, msg:"Invalid request"});
			}
		});
	} catch(e) {
		res.json({status:false, msg:"Invalid request"});
	}
});

function uploadKyc(req, callback) {
	var imgArray = [];
	if(req.files.length > 0) {
		let len = req.files.length;
		var uploaded = 0;
		for(i=0; i<len; i++){
			cloudinary.uploadImage(req.files[i].path, function(imgRes){
				if(imgRes != undefined) {
					var orgName = imgRes.original_filename;
					var checkPrf = orgName.indexOf("selfie_proof");
					var checkPrf1 = orgName.indexOf("addr_proof");
					var proofName = (checkPrf > -1) ? "selfie_proof" : ((checkPrf1 > -1) ? "addr_proof" : "id_proof");
					imgArray[proofName]=imgRes.secure_url;
				}
				uploaded = uploaded + 1;
				if(len == uploaded){
					callback(imgArray);
				}
			});
		}
	} else {
		callback(imgArray);
	}
}

router.post('/updateStepOne', upload.array('imgProof[]',50), common.userVerify, function(req, res, next) {
	try {
		let userId = req.userId;
		let info = req.body;
		users.findOne({"_id":userId}, {_id:0, pro_status:1}).exec(function(err, resData) {
			if(resData) {
				if(resData.pro_status == 1) {
					uploadImgProof(req, function(imgArray, ownArr, resArr, legArr) {
						var dircollData = [];
					    for (let j = 0; j < info.dirLen; j++) {let cont = j+1;
					    	let DirDOB =  moment(info['dob_dir'+cont], 'MM-DD-YYYY').format('YYYY-MM-DD');
					    	var img = imgArray.filter(item => item.indexOf('dir'+j) !== -1);
					        let obj = {alpha_code: info['country_dir'+cont], username: info['username_dir'+cont], dob:DirDOB, image: img[0], type:info['type_dir'+cont], issuAlp:info['issuCountry_dir'+cont], issuCountry:info['issuAlp_dir'+cont], country:info['alpha_code_dir'+cont] }
					      	dircollData.push(obj);
					    }
					    var owncollData = [];
					    for (let j = 0; j < info.ownLen; j++) {let cont = j+1;
					    	let OwnDOB =  moment(info['dob_own'+cont], 'MM-DD-YYYY').format('YYYY-MM-DD');
					    	var img1 = ownArr.filter(item => item.indexOf('own'+j) !== -1);
					      	let obj = {alpha_code: info['country_own'+cont], username: info['username_own'+cont], dob:OwnDOB, image: img1[0], type:info['type_own'+cont], issuAlp:info['issuCountry_own'+cont], issuCountry:info['issuAlp_own'+cont],country:info['alpha_code_own'+cont]}
					      	owncollData.push(obj);
					    }
					    var rescollData = [];
					    for (let j = 0; j < info.resLen; j++) {let cont = j+1;
					    	var ResDOB =  moment(info['dob_rep'+cont], 'MM-DD-YYYY').format('YYYY-MM-DD');
					    	if(ResDOB == 'Invalid date'){ResDOB = null;}
					    	var img2 = resArr.filter(item => item.indexOf('res'+j) !== -1);
					      	let obj = {alpha_code: info['country_rep'+cont], username: info['username_rep'+cont], dob:ResDOB, image: img2[0],type:info['type_rep'+cont], issuAlp:info['issuCountry_rep'+cont], issuCountry:info['issuAlp_rep'+cont], country:info['alpha_code_own'+cont]}
					      	obj.alpha_code = (obj.alpha_code == 'undefined') ? '' :  obj.alpha_code;
					      	obj.username = (obj.username == 'undefined') ? '' :  obj.username;
					      	obj.issuAlp = (obj.issuAlp == 'undefined') ? '' :  obj.issuAlp;
					      	obj.issuCountry = (obj.issuCountry == null) ? '' :  obj.issuCountry;
					      	obj.country = (obj.country == 'undefined') ? '' :  obj.country;
					      	obj.dob = (obj.dob == 'undefined') ? '' :  obj.dob;
					      	rescollData.push(obj);
					    }
					    var legcollData = [];
					    for (let j = 0; j < info.legLen; j++) {let cont = j+1;
					    	let LegDOB =  moment(info['dob_leg'+cont], 'MM-DD-YYYY').format('YYYY-MM-DD');
					    	var img2 = legArr.filter(item => item.indexOf('leg'+j) !== -1);
					      	let obj = {dob:LegDOB, image: img2[0], address: info['address_leg'+cont], code: info['code_leg'+cont]}
					      	legcollData.push(obj);
					    }
					    let obj = {
					    	'dir' : dircollData,
					    	'own' : owncollData,
					    	'res' : rescollData,
					    	'leg' : legcollData,
					    	'step1_status' : 1,
					    }
					    business.updateOne({ user_id: req.userId },{$set : obj }).exec(function(err,result){
							if(result){
								res.json({status:true, msg:"Documents submitted succesfully", data:obj});
							} else {
								res.json({status:false, msg:"Something went wrong. Please try again"});
							}
						});

						/*let obj = {
							'username1' : info.username1,
							'dob1' : info.dob1,
							'country1' : info.country1,
							'alpha_code1' : info.alpha_code1,
							'username2' : info.username2,
							'dob2' : info.dob2,
							'country2' : info.country2,
							'alpha_code2' : info.alpha_code2,
							'username3' : info.username3,
							'dob3' : info.dob3,
							'id_number3' : info.id_number3,
							'step1_status' : 1,
						};
						if(imgArray['image1'] != null && imgArray['image1'] != undefined) {
							obj["image1"] = imgArray['image1'];
						} else {
							res.json({ status:false, msg:"Please upload valid image" });
						}
						if(imgArray['image2'] != null && imgArray['image2'] != undefined) {
							obj["image2"] = imgArray['image2'];
						} else {
							res.json({ status:false, msg:"Please upload valid image" });
						}
						if(imgArray['image3'] != null && imgArray['image3'] != undefined) {
							obj["image3"] = imgArray['image3'];
						} else {
							res.json({ status:false, msg:"Please upload valid image" });
						}
						business.updateOne({ user_id: req.userId },{$set : obj }).exec(function(err,result){
							if(result){
								res.json({status:true, msg:"Documents submitted succesfully", data:obj});
							} else {
								res.json({status:false, msg:"Something went wrong. Please try again"});
							}
						});*/

					});
				} else {
					res.json({status:false, msg:"Please complete your profile"});	
				}
			} else {
				res.json({status:false, msg:"Invalid request"});
			}
		});
	} catch(e) {
		res.json({status:false, msg:"Invalid request"});
	}
});

function uploadImgProof(req, callback, ownArr, resArr, legArr) {
	var imgArray = [];
	var OwnArray = [];
	var ResArray = [];
	var LegArray = [];
	if(req.files.length > 0) {
		let len = req.files.length;
		var uploaded = 0;
		for(i=0; i<len; i++){
			let fileIdPath =req.files[i]
			if((fileIdPath.path.indexOf("image4") !== -1) || (fileIdPath.path.indexOf("image5") !== -1) || (fileIdPath.path.indexOf("image6") !== -1) || (fileIdPath.path.indexOf("image7") !== -1)){
				cloudinary.uploadImage(req.files[i].path, function(imgRes){
					if(imgRes != undefined) {
						var orgName = imgRes.original_filename;
						if(orgName.indexOf("image4") !== -1){
							imgArray.push(imgRes.secure_url);
						}if(orgName.indexOf("image5") !== -1){
							OwnArray.push(imgRes.secure_url);
						}if(orgName.indexOf("image6") !== -1){
							ResArray.push(imgRes.secure_url);
						}if(orgName.indexOf("image7") !== -1){
							LegArray.push(imgRes.secure_url);
						}
					}
					uploaded = uploaded + 1;
					if(len == uploaded){
						callback(imgArray,OwnArray, ResArray, LegArray);
					}
				});
			}

			/*cloudinary.uploadImage(req.files[i].path, function(imgRes){
				if(imgRes != undefined) {
					var orgName = imgRes.original_filename;
					var proofName = "image1";
					var checkPrf = orgName.indexOf("image3");
					var checkPrf1 = orgName.indexOf("image2");

					if(checkPrf > -1) {
						var proofName = 'image3';
					} else {
						var proofName = (checkPrf1 > -1) ? "image2" : "image1";
					}
					imgArray[proofName]=imgRes.secure_url;
				}
				uploaded = uploaded + 1;
				if(len == uploaded){
					callback(imgArray);
				}
			});*/
		}
	} else {
		callback(imgArray,OwnArray, ResArray);
	}
}

router.post('/updateStepTwo', common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	let value1 = validator.isEmpty(info.value1);
	let value2 = validator.isEmpty(info.value2);
	let value3 = validator.isEmpty(info.value3);
	let value4 = validator.isEmpty(info.value4);
	let value5 = validator.isEmpty(info.value5);

	if(value1 || value2 || value3 || value4 || value5) {
		res.json({status:false, msg:"Enter all fields"});
	} else {
		business.findOne({user_id: userId}).exec(function(error, resData){
			if(!resData){
				res.json({success:0, msg:'Invalid User'});
			} else {
				var collData = [];
			    for (let j = 0; j < info.stepthirdLen; j++) {let cont = j+1;
			        let obj = {name: info['name'+cont], status: info['status'+cont], note:info['note'+cont]};

			    	if(info['legOpone'+cont] !== null && info['legOpone'+cont] !== undefined){obj.legOpone = info['legOpone'+cont];}
			    	if(info['legOptwo'+cont] !== null && info['legOptwo'+cont] !== undefined){obj.legOptwo = info['legOptwo'+cont];}
			    	if(info['legshare'+cont] !== null && info['legshare'+cont] !== undefined){obj.shares = info['legshare'+cont];}
			    	if(info['legstr'+cont] !== null && info['legstr'+cont] !== undefined){obj.legother = info['legstr'+cont];}
			    	if(info['truststr'+cont] !== null && info['truststr'+cont] !== undefined){obj.trustother = info['truststr'+cont];}
			    	collData.push(obj);
			    }
				var obj = {
					value1 : info.value1,
					value2 : info.value2,
					value3 : info.value3,
					value4 : info.value4,
					value5 : info.value5,
					additionalData : collData,
					step2_status : 1,
				};
				business.updateOne({user_id:userId}, {$set : obj }).exec(function(upErr, upRes) {
					if(upRes) {
						res.json({status:true, msg:"Details updated successfully"});
					} else {
						res.json({status:false, msg:"Failed to update password"});
					}
				});

			}
		});
	}
});

/*router.post('/updateStepTwo', common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	let value1 = validator.isEmpty(info.value1);
	let value2 = validator.isEmpty(info.value2);
	let value3 = validator.isEmpty(info.value3);
	let value4 = validator.isEmpty(info.value4);
	let value5 = validator.isEmpty(info.value5);
	let value6 = validator.isEmpty(info.value6);
	let value7 = validator.isEmpty(info.value7);
	let value8 = validator.isEmpty(info.step2_name);
	if(value1 || value2 || value3 || value4 || value5 || value6 || value7|| value8) {
		res.json({status:false, msg:"Enter all fields"});
	} else {
		business.findOne({user_id: userId}).exec(function(error, resData){
			if(!resData){
				res.json({success:0, msg:'Invalid User'});
			} else {
				var obj = {
					value1 : info.value1,
					value2 : info.value2,
					value3 : info.value3,
					value4 : info.value4,
					value5 : info.value5,
					value6 : info.value6,
					value7 : info.value7,
					step2_name : info.step2_name,
					step2_status : 1,
				};
				if(resData.person == 'legal'){
					obj.value8 = info.value8;
					obj.value9 = info.value9;

					if(info.value8 == 'holder_share'){
				        obj.shares = info.shares;
				    }else if(info.value8 == 'other'){
				        obj.legother = info.legother; 
				    }
				    if(info.value9 == 'other'){
				        obj.trustother = info.trustother; 
				    }
				}
				business.updateOne({user_id:userId}, {$set : obj }).exec(function(upErr, upRes) {
					if(upRes) {
						res.json({status:true, msg:"Details updated successfully"});
					} else {
						res.json({status:false, msg:"Failed to update password"});
					}
				});
			}
		});
	}
});
*/
router.post('/updateStepThree', upload.array('docProof[]',12), common.userVerify, function(req, res, next) {
	try {
		let userId = req.userId;
		let info = req.body;
		business.findOne({user_id:userId}).exec(function(err, resData) {
			if(resData) {
				uploadDocProof(req, function(imgArray) {
					let obj = {
						step3_status : 1,
					};
					if(resData.proof_status1 == 0 || resData.proof_status1 == 2) {
						if(imgArray['proof1'] != null && imgArray['proof1'] != undefined) {
							obj["proof1"] = imgArray['proof1'];
							obj["proof_status1"] = 1;
							obj['proof_type1'] = (imgArray['proof1'].indexOf(".pdf") !== -1) ? 'pdf' : 'image';
						} else {
							obj["proof_status1"] = 4;
						}
					}
					if(resData.proof_status2 == 0 || resData.proof_status2 == 2) {
						if(imgArray['proof2'] != null && imgArray['proof2'] != undefined) {
							obj["proof2"] = imgArray['proof2'];
							obj["proof_status2"] = 1;
							obj['proof_type2'] = (imgArray['proof2'].indexOf(".pdf") !== -1) ? 'pdf' : 'image';
						} else {
							obj["proof_status2"] = 4;
						}
					}
					if(resData.proof_status3 == 0 || resData.proof_status3 == 2) {
						if(imgArray['proof3'] != null && imgArray['proof3'] != undefined) {
							obj["proof3"] = imgArray['proof3'];
							obj["proof_status3"] = 1;
							obj['proof_type3'] = (imgArray['proof3'].indexOf(".pdf") !== -1) ? 'pdf' : 'image';
						} else {
							obj["proof_status3"] = 4;
						}
					}
					if(resData.proof_status4 == 0 || resData.proof_status4 == 2) {
						if(imgArray['proof4'] != null && imgArray['proof4'] != undefined) {
							obj["proof4"] = imgArray['proof4'];
							obj["proof_status4"] = 1;
							obj['proof_type4'] = (imgArray['proof4'].indexOf(".pdf") !== -1) ? 'pdf' : 'image';
						} else {
							obj["proof_status4"] = 4;
						}
					}
					if(resData.proof_status5 == 0 || resData.proof_status5 == 2) {
						if(imgArray['proof5'] != null && imgArray['proof5'] != undefined) {
							obj["proof5"] = imgArray['proof5'];
							obj["proof_status5"] = 1;
							obj['proof_type5'] = (imgArray['proof5'].indexOf(".pdf") !== -1) ? 'pdf' : 'image';
						} else {
							obj["proof_status5"] = 4;
						}
					}
					if(resData.proof_status6 == 0 || resData.proof_status6 == 2) {
						if(imgArray['proof6'] != null && imgArray['proof6'] != undefined) {
							obj["proof6"] = imgArray['proof6'];
							obj["proof_status6"] = 1;
							obj['proof_type6'] = (imgArray['proof6'].indexOf(".pdf") !== -1) ? 'pdf' : 'image';
						} else {
							obj["proof_status6"] = 4;
						}
					}
					if(resData.proof_status7 == 0 || resData.proof_status7 == 2) {
						if(imgArray['proof7'] != null && imgArray['proof7'] != undefined) {
							obj["proof7"] = imgArray['proof7'];
							obj["proof_status7"] = 1;
							obj['proof_type7'] = (imgArray['proof7'].indexOf(".pdf") !== -1) ? 'pdf' : 'image';
						} else {
							obj["proof_status7"] = 4;
						}
					}
					if(obj.proof_status1 == 4 || obj.proof_status2 == 4 || obj.proof_status3 == 4 || obj.proof_status4 == 4 || obj.proof_status5 == 4 || obj.proof_status6 == 4 || obj.proof_status7 == 4) {
						res.json({ status:false, msg:"Please upload valid documents" });
					} else {
						business.updateOne({ user_id: req.userId },{$set : obj }).exec(function(err,result){
							if(result){
								users.updateOne({ "_id": req.userId },{$set : {"kyc_status": 1} }).exec(function(err,result){});
								res.json({status:true, msg:"Documents submitted succesfully"});
							} else {
								res.json({status:false, msg:"Something went wrong. Please try again"});
							}
						});
					}
				});
			} else {
				res.json({status:false, msg:"Invalid request"});
			}
		});
	} catch(e) {
		res.json({status:false, msg:"Invalid request"});
	}
});

function uploadDocProof(req, callback) {
	var imgArray = [];
	if(req.files.length > 0) {
		let len = req.files.length;
		var uploaded = 0;
		for(i=0; i<len; i++){
			cloudinary.uploadImage(req.files[i].path, function(imgRes){
				if(imgRes != undefined) {
					var orgName = imgRes.original_filename;
					if(orgName.indexOf("proof1") > -1) {
						var proofName = 'proof1';
					} else if(orgName.indexOf("proof2") > -1) {
						var proofName = 'proof2';
					} else if(orgName.indexOf("proof3") > -1) {
						var proofName = 'proof3';
					} else if(orgName.indexOf("proof4") > -1) {
						var proofName = 'proof4';
					} else if(orgName.indexOf("proof5") > -1) {
						var proofName = 'proof5';
					} else if(orgName.indexOf("proof6") > -1) {
						var proofName = 'proof6';
					} else if(orgName.indexOf("proof7") > -1) {
						var proofName = 'proof7';
					}
					imgArray[proofName]=imgRes.secure_url;
				}
				uploaded = uploaded + 1;
				if(len == uploaded){
					callback(imgArray);
				}
			});
		}
	} else {
		callback(imgArray);
	}
}

/* Add coin details */
router.post('/getUserCoin', common.userVerify, (req,res) => {
	let userId = req.userId;
	let planVal = validator.isEmpty(req.body.plan);
	if (planVal) {
		return res.json({ status: false, msg: "Invalid Request" });
	}
	var plan = req.body.plan;
	async.parallel({
		UserInfo:function(cb) {
			users.findOne({"_id": userId}).select("username primary_value added_val").exec(cb)
		},	
		userWal:function(cb) {
			wallet.findOne({user_id:userId}, {wallet:{$elemMatch:{currency:'BTC'}}, _id:0}).exec(cb)

		},
		plan:function(cb) {
			settings.findOne({},{_id:0}).select("1BaseMarket 3BaseMarket").exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		let resData  = results.UserInfo;
		let listPlan = results.plan;
		var walArr = results.userWal.wallet;
		if(walArr.length == 0) { userBal = 0; } else { userBal = walArr[0].amount; }
		resData.email=encdec.decryptNew(resData.primary_value)+encdec.decryptNew(resData.added_val);
		let obj = {"name":resData.username, "email_id":resData.email, "btc_balance":userBal,"plan":listPlan};			
		res.json({status:true, user:obj});		
	})
});

router.post('/listCoin', common.userVerify, (req,res) => {
	try {
		let info = req.body;
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		let coin_name = validator.isEmpty(info.coin_name);
		let coin_ticker = validator.isEmpty(info.coin_ticker);
		let email = validator.isEmpty(info.email);
		let logo = validator.isEmpty(info.logo);
		let plan_type = validator.isEmpty(info.plan_type);
		if(coin_name || coin_ticker || email || logo || plan_type) {
			return res.json({success:0, msg:"Please enter all details"});
		}
		var selField = {};
		selField['_id'] = 0;
		let choosed_plan = info.plan_type;
		selField[choosed_plan] = 1;
		var selCurr  = 'BTC';
		users.findOne({_id:userId}, {username:1}).exec(function(userErr,userRes) {
			if(userRes) {
				async.parallel({
					userWal:function(cb) {
						wallet.findOne({user_id:userId}, {wallet:{$elemMatch:{currency:selCurr}}, _id:0}).exec(cb)
					},
					plan:function(cb) {
						settings.findOne({},selField).exec(cb)
					},
				},function(err,results){
					if (err) { return res.json({success:2, msg:"Please try again later"}); }
					var walArr = results.userWal.wallet;
					if(walArr.length == 0) { userBal = 0; } else { userBal = walArr[0].amount; }
					var amount = results.plan[choosed_plan];
					if(userBal < amount) { return res.json({success:0, msg:"Insufficient Balance"}); }
					var upBal = userBal - amount;
					let coinData = {
						user_id : userId,
						email : info.email,
						coin_name : info.coin_name,
						coin_ticker : info.coin_ticker,
						coin_algo : info.coin_algo,
						source_code : info.source_code,
						block_explorer : info.block_explorer,
						ann_thread : info.ann_thread,
						website :info.website,
						logo : info.logo,
						twitter : info.twitter,
						tele_group : info.tele_group,
						any_other : info.any_other,
						list_type : info.plan_type,
						status : "Pending",
					};
					upBal = upBal.toFixed(8);
					common.updateUserBalance(userId, selCurr, upBal, function(callRes) {
						if(callRes) {
							listCoin.create(coinData, function(coinerr,coinRes) {
								if(coinRes) {
									return res.json({success:1, msg:"Coin is added succesfully",btc_balance:upBal});
								} else {
									return res.json({success:0, msg:"Failed to add list coin"});
								}
							});
						} else {
							return res.json({success:0, msg:"Failed to update balance"});
						}
					});
				});
			} else {
				return res.json({success:0, msg:"Invalid User"});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

var mapReferral = function() {};
let _referMap = new mapReferral();
var respData = [];

router.get('/get_referral', common.tokenMiddleware, (req, res) => {
	try {
		let userId  = req.userId;
		users.findOne({_id:userId},{refer_id:1}).exec(function(userErr, userRes) {
			users.find({referrer_id:userRes.refer_id},{username:1, refer_id:1, status:1, primary_value:1, added_val:1, kyc_status:1}).exec(function(levelErr, levelRes) {
				response.refer_id = userRes.refer_id;
				response.refer_count = 0;
				if(levelRes.length != 0) {
					response.data = [];
					response.levelOne = [];
					response.levelTwo = [];
					// response.levelOne = levelRes;
					var inc = 0;
					_referMap.getReferralLevelTwo(levelRes, inc, (resTwo) => {
						// response.levelTwo = resTwo;
						let user_status,kyc_status;
						for(i=0;i<levelRes.length;i++){
							let first  = levelRes[i].primary_value;
							let second = levelRes[i].added_val;
							if(levelRes[i].status == '1'){
								user_status = 'Active';
							} else {
								user_status = 'Inactive';
							}
							if(levelRes[i].kyc_status == '3') { kyc_status  = 'Verified'; } else { kyc_status  = 'Not Verified'; }
							var nn = {
								email: encdec.decryptNew(first)+encdec.decryptNew(second),
								level: "Level 1",
								username: levelRes[i].username,
								status: user_status,
								kyc_status: kyc_status,
								refer_id: levelRes[i].refer_id
							}
							response.levelOne.push(nn)
						}
						for(i=0;i<resTwo.length;i++){
							let first  = resTwo[i].primary_value;
							let second = resTwo[i].added_val;
							if(resTwo[i].status == '1'){
								user_status = 'Active';
							} else {
								user_status = 'Inactive';
							}
							if(resTwo[i].kyc_status == '3'){ kyc_status  = 'Verified'; } else { kyc_status  = 'Not Verified'; }
							var nn = {
								email: encdec.decryptNew(first)+encdec.decryptNew(second),
								level: "Level 2",
								username: resTwo[i].username,
								status: user_status,
								kyc_status: kyc_status,
								refer_id: resTwo[i].refer_id
							}
							response.levelTwo.push(nn)
						}
						respData = []
						response.refer_count = response.levelOne.length + response.levelTwo.length;
						res.json({status:true, data:response, success:true})
					})
				} else {
					res.json({status:true, data:response, success:false, message:"No Records"})
				}
			})
		})
	}
	catch(e) {
		console.log("get_referral", e)
	}
})

mapReferral.prototype.getReferralLevelTwo = function (data, inc, callback) {
	var info = data[inc];
	users.find({referrer_id:info.refer_id},{username:1, refer_id:1, status:1, primary_value:1, added_val:1, kyc_status:1}).exec(function(levelErr, levelRes) {
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

// router.get('/get_referral',common.userVerify, (req,res) => {
	// 	try {
	// 		let id = req.userId;
	// 		users.findOne({_id:id},{refer_id:1}).exec(function(userErr, userRes) {
	// 			users.find({referrer_id:userRes.refer_id},{username:1, refer_id:1, status:1, primary_value:1, added_val:1, kyc_status:1, zipcode:1}).exec(function(levelErr, levelRes) {
	// 				response.data = [];
	// 				response.refer_id    = userRes.refer_id;
	// 				response.refer_count = levelRes.length;
	// 				if(levelRes.length != 0) {
	// 					response.levelOne = [];
	// 					response.levelTwo = [];
	// 					response.levelOne = levelRes;
	// 					var inc = 0;
	// 					getReferralLevelTwo(levelRes, inc)
	// 					for(i=0;i<response.levelOne.length;i++){
	// 						let first  = response.levelOne[i].primary_value;
	// 						let second = response.levelOne[i].added_val;
	// 				  	response.levelOne[i].email = encdec.decryptNew(first)+encdec.decryptNew(second);
	// 				  	response.levelOne[i].zipcode = 'level 1';
	// 					}
	// 					for(j=0;j<response.levelTwo.length;j++){
	// 						let first  = response.levelTwo[j].primary_value;
	// 						let second = response.levelTwo[j].added_val;
	// 				  	response.levelTwo[j].email = encdec.decryptNew(first)+encdec.decryptNew(second);
	// 				  	response.levelTwo[j].zipcode = 'level 2';
	// 					}
	// 					res.json({status:true, refData:response})
	// 				}
	// 				else {
	// 					res.json({status:true, refData:response})
	// 				}
	// 			})
	// 		})
	// 	}
	// 	catch(e) {
	// 		console.log("getReferral", e)
	// 	}
	// });
	// function getReferralLevelTwo(data, inc) {
	// 	var info = data[inc];
	// 	users.find({referrer_id:info.refer_id},{username:1, refer_id:1, status:1, primary_value:1, added_val:1, kyc_status:1}).exec(function(levelErr, levelRes) {
	// 		if(levelRes.length != 0) {
	// 			response.levelTwo.push(levelRes)
	// 		}
	// 		else {
	// 			if(inc < data.length-1) {
	// 				inc++
	// 				getReferralLevelTwo(data, inc)
	// 			}
	// 			else {
	// 				return false;
	// 			}
	// 		}
	// 	})
// }

router.get('/getKycUsers', (req, res) => {
	let start = req.query.from;
	let end = req.query.to;
	var split = start.split(" ");
	if(split.length != 2) {
		return res.json({msg:"Invalid from time"});
	}
	var from = split[0]+'T'+split[1]+':00.000Z';
	var split1 = end.split(" ");
	if(split1.length != 2) {
		return res.json({msg:"Invalid to time"});
	}
	var to = split1[0]+'T'+split1[1]+':00.000Z';
	async.parallel({
		usersCount:function(cb) {
			users.find({kyc_status:3, updated_at:{$gte:new Date(from), $lt:new Date(to)}}).countDocuments().exec(cb)
		},
		usersData:function(cb) {
			users.find({kyc_status:3, updated_at:{$gte:new Date(from), $lt:new Date(to)}}, { username:1,primary_value:1,added_val:1 }).sort({updated_at:-1 }).exec(cb)
		},
	},function(err,results) {
		common.formatUsers(results.usersData, function(userRes) {
			res.json({Count:results.usersCount, results:JSON.parse(userRes)})
		})
	});
});

router.get('/getRejectUsers', (req, res) => {
	let start = req.query.from;
	let end = req.query.to;
	var split = start.split(" ");
	if(split.length != 2) {
		return res.json({msg:"Invalid from time"});
	}
	var from = split[0]+'T'+split[1]+':00.000Z';
	var split1 = end.split(" ");
	if(split1.length != 2) {
		return res.json({msg:"Invalid to time"});
	}
	var to = split1[0]+'T'+split1[1]+':00.000Z';
	async.parallel({
		usersCount:function(cb) {
			users.find({kyc_status:2, updated_at:{$gte:new Date(from), $lt:new Date(to)}}).countDocuments().exec(cb)
		},
		usersData:function(cb) {
			users.find({kyc_status:2, updated_at:{$gte:new Date(from), $lt:new Date(to)}}, { username:1,primary_value:1,added_val:1 }).sort({updated_at:-1 }).exec(cb)
		},
	},function(err,results) {
		common.formatUsers(results.usersData, function(userRes) {
			res.json({Count:results.usersCount, results:JSON.parse(userRes)})
		})
	});
});

router.post('/kycPendingEmail', (req, res) => {
	try {
		let info = req.body;
		let userId = info.user_id;
		users.findOne({_id:mongoose.mongo.ObjectId(userId)}, {primary_value:1, added_val:1, username:1}).exec(function(userErr, userRes) {
			if (userErr) { return res.json({success:0, msg:"Please try again later"}); }
			if(userRes) {
				let specialVars = { '###USER###': userRes.username};
				let usermail = encdec.decryptNew(userRes.primary_value) + encdec.decryptNew(userRes.added_val);
				mail.sendMail('operations@gs20.com', 'kyc_pending', specialVars, function(mailRes) { });
				res.json({success:1, msg:"KYC status email sent."});
			} else {
				res.json({success:0, msg:"Invalid User"});
			}
		})
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
})

router.post('/setStepOne',common.tokenMiddleware, (req, res)=>{
	var info = req.body;
	var userId = req.userId;
	if(info.persontyp == undefined || info.persontyp == ''){return res.json({success:0, msg:"Invalid data!"})};
	business.findOne({user_id: userId},{step0_status:1, _id:0}).exec(function(err, resData){
		if(resData){
			if(resData.step0_status == 0){
				var obj = {step0_status:1,person: info.persontyp,}
				business.updateOne({user_id: userId},{$set : obj}).exec(function(busErr, busRes){
					if(busRes){
						return res.json({success:1, data:obj});
					}else{
						return res.json({success:0, msg:"Something wents wrong!"});
					}
				})
			}else{
				return res.json({success:0, msg:"person data already exists !"});
			}
		}else{
			return res.json({success:0, msg:"Something wents wrong!"});
		}
	})
})

module.exports = router;