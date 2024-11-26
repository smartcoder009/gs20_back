const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const async  = require('async');
const loginAttempts = require('../../model/loginAttempts');
const blockip = require('../../model/blockip');
const fs = require('fs');

const common = require('../../helpers/common');
const endecrypt = require('../../helpers/newendecryption');
const cloudinary = require('../../helpers/cloudinary');
const mail = require('../../helpers/mail');
const tradeHlp = require('../../helpers/trade');
const disposal = require('../../helpers/disposal_email');

const moment = require('moment');
const validator = require('validator');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const useragent = require('useragent');

//schemas
const notify = require('../../model/notify');
const users = require('../../model/users');
const currency = require('../../model/currency');
const userhis = require('../../model/userhistory');
const addrModel = require('../../model/userAddress');
const wallet = require('../../model/userWallet');
const deposit = require('../../model/deposit');
const withdraw = require('../../model/withdraw');
const orderDB = require('../../model/CoinOrder');
const mapDb = require('../../model/mapping');
const subscribe = require('../../model/subscribe');
const business = require('../../model/business');
const liminalDeposit = require('../../model/liminalDeposit');

router.post('/findUsername', function (req, res) {
	let usrname = validator.isEmpty(req.body.username);
	users.findOne({username:req.body.username}, {_id:1}).exec(function (err, data) {
		if(err){
			return res.json({success:2, msg:"Try again later"});
		}
		if(data && usrname){
			return res.json({success:0, msg:"username already exists"});
		} else {
			return res.json({success:1});
		}
	});
});

router.post('/findEmail', function (req, res) {
	let e = validator.isEmail(req.body.email);
	let usrmail   = req.body.email.toLowerCase();
	var firstHalf = endecrypt.encryptNew(endecrypt.firstNewMail(usrmail));
	var secondHalf= endecrypt.encryptNew(endecrypt.secondNewMail(usrmail));
	users.findOne({$and:[{primary_value:firstHalf, added_val:secondHalf}]}).exec(function(userErr,userRes) {
		if(userErr){
			return res.json({success:2, msg:"Try again later"});
		}
		if(userRes && e) {
			return res.json({success:0, msg:"Email already exists"});
		} else {
			return res.json({success:1});
		}
	});
});

router.post('/signup', (req,res) => {
	try {
		let info = req.body;
		let email = validator.isEmail(info.email);
		let userVal = validator.isEmpty(info.username);
		let ccVal = validator.isEmpty(info.country_code);
		let phnVal = validator.isEmpty(info.phone);
		let optradio = validator.isEmpty(info.optradio);

		if(ccVal || phnVal) {
			return res.json({success:0, msg:"Enter all fields"});
		}
		let comparePwd = validator.equals(info.password, info.confirm_password);
		var mailFrm = info.email.substring(info.email.lastIndexOf("@")+1);
		if (disposal.indexOf(mailFrm) > -1) { 
			return res.json({success:0, msg:"Invaild email"});
		}
		if(email && comparePwd && info.agree && !userVal) {
			let usermail = info.email.toLowerCase();
			var firstEmail = endecrypt.encryptNew(endecrypt.firstNewMail(usermail));
			var secondEmail = endecrypt.encryptNew(endecrypt.secondNewMail(usermail));
			users.find({$or:[{primary_value:firstEmail, added_val:secondEmail}, {username:info.username}, {phone:info.phone}]}).countDocuments().exec(function(userErr,userRes) {
				if(userRes) {
					res.json({success:0, msg:"Username/Email/Phone already exists"});
				} else {
					var ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
					ip = ip.replace('::ffff:', '');
					common.checkRefer(info.refer, (refRes) => {
						if(refRes) {
							common.referId((refId) => {
								var pwd =[];
								var qrName = `GS20Exchange (${usermail})`;
								var secret = speakeasy.generateSecret({ length: 10, name: qrName });
								var tfaCode = secret.base32;
								var tfaUrl = secret.otpauth_url;
								var url = tfaUrl.replace(tfaCode, "");
								endecrypt.hashPswd(info.password, function(encPwd) {
									pwd.push(encPwd);
									let obj = {
										username    : info.username,
										primary_value: firstEmail,
										protect_key : encPwd,
										added_val   : secondEmail,
										tfa_code    : endecrypt.withEncrypt(tfaCode),
										tfa_url     : url,
										secretkey   : pwd,
										refer_id    : refId,
										phone       : info.phone,
										country_code: info.country_code,
										referrer_id : info.refer,
										ip_address  : ip,
										acc_type  	: info.optradio
									}
									users.create(obj, function(err,resData) {
										if(resData) {
											var userId = resData._id;
											var encuId = endecrypt.encryptNew(userId.toString());
											var uri = endecrypt.userUrl(req)+'activate_account?token='+encodeURIComponent(encuId);
											var specialVars = { '###LINK###': uri, '###URL###': uri, '###USER###': info.username };
											mail.sendMail(usermail, 'activate_mail', specialVars, function(mailRes) {	});
											res.json({success:1, msg:'Account activation link sent to your email'});
										} else {
											res.json({success:0, msg:'Failed to create an user.'});				
										}
									});
								});
							})
						} else {
							return res.json({success:0, msg:"Invalid Refer ID"});
						}
					})
				}
			});
		} else {
			if(!comparePwd) {
				return res.json({success:0, msg:"Password does not match"});
			}
			res.json({success:0, msg:"Please enter all details"});
		}
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

function activateUser(userId, cb) {
	var userObj = mongoose.Types.ObjectId(userId);
	currency.find({},{_id:0,symbol:1}).exec(function(curErr,curRes) {
		let walData = {"wallet":[], "user_id":userObj};
		let adrData = {"address":[], "user_id":userObj};
		addrModel.create(adrData, function(addrErr,addrRes) {
			if(addrRes) {
				common.activateWallet(curRes, walData, function(data) {
					wallet.create(data, function(walErr,walRes) {
						if(walRes) {
							cb(1);
						} else {
							cb(0);
						}
					});
				});
			}
		});
	});
}

router.post('/activateEmail', (req,res) => {
	try {
		let info = req.body;
		let tokenVal = validator.isEmpty(info.token);
		if(!tokenVal) {
			var userId=endecrypt.decryptNew(decodeURIComponent(info.token));
			if(userId != '') {
				users.findOne({_id:userId}, {status:1, acc_type:1}).exec(function(userErr,userRes) {
					if(userRes && userRes.status == 0) {
						var userObj = mongoose.Types.ObjectId(userId);
						users.updateOne({_id : userObj},{"$set":{status:1}}).exec(function(upErr,upRes) {
							if(upRes) {
								currency.find({},{_id:0,symbol:1}).exec(function(curErr,curRes) {
									let walData = {"wallet":[], "user_id":userObj};
									let adrData = {"address":[], "user_id":userObj};
									addrModel.create(adrData, function(addrErr,addrRes) {
										if(addrRes) {
											common.activateWallet(curRes, walData, function(data) {
												wallet.create(data, function(walErr,walRes) {
													if(walRes) {
														if(userRes.acc_type == 'business') {
															let bData = {"user_id":userObj};
															business.create(bData, function(bErr,bRes) {});
														}
														res.json({success:1, msg:"Account activated successfully"});
													} else {
														res.json({success:0, msg:"Failed to create wallet"});
													}
												});
											});
										}
									});
								});
							} else {
								res.json({success:0, msg:"Failed to activate account"});
							}
						});
					} else {
						res.json({success:0, msg:"Account already activated"});
					}
				});
			}
		} else {
			res.json({success:0, msg:"Invalid Request"});
		}
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.post('/login', (req,res) => {
	try {
		let info  = req.body;
		let email = validator.isEmail(info.email);
		let passVal = validator.isEmpty(info.password);
		var mailFrm = info.email.substring(info.email.lastIndexOf("@")+1);
		if (disposal.indexOf(mailFrm) > -1) { 
			return res.json({success:3, msg:"Invaild email"});
		}			
		if(email && !passVal) {
			let usermail = info.email.toLowerCase();
			var first = endecrypt.encryptNew(endecrypt.firstNewMail(usermail));
			var second = endecrypt.encryptNew(endecrypt.secondNewMail(usermail));
			users.findOne({primary_value:first, added_val:second}, {_id:1, status:1, username:1, tfa_status:1, protect_key:1}).exec(function(userErr,userRes) {
				if(userRes) {
					endecrypt.comparePswd(info.password, userRes.protect_key, function(pwdRes) {
						if(pwdRes) {
							var userId = userRes._id;
							var encUserId = endecrypt.encryptNew(userId.toString());
							if(userRes.status == 0) {
								return res.json({success:0, msg:"Please activate your account"});
							} else if(userRes.status == 2) {
								return res.json({success:0, msg:"Your account has been blocked"});
							} else if(userRes.status == 3) {
								return res.json({success:0, msg:"Your account has been deleted"});
							} else {
								if(userRes.tfa_status == 1) {
									return res.json({success:2, ttoken:encodeURIComponent(encUserId)});
								} else {
									let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
									ip = ip.replace('::ffff:', '');
									var agent = useragent.parse(req.headers['user-agent']);
									var os = agent.os.toString().split(' ')[0];
									var browser = agent.toAgent().split(' ')[0];
									let obj = { user_id:userId, ip_address:ip, browser:browser, image:"", deviceinfo:os };
									userhis.create(obj, function(err, result) {
										if(result) {
											checkLastIp(userId, usermail, userRes.username, ip, result._id);
											let authKey = common.createPayload(userId);
											return res.json({success:1, token:authKey, ttoken:encodeURIComponent(encUserId)});
										} else {
											res.json({success:0, msg:"Failed to login"});
										}
									});
								}
							}
						} else {
							Ipblock(req, res)
						}
					});
				} else {
					Ipblock(req, res)
				}
			})
		} else {
			Ipblock(req, res)
		}
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

let updatedDate = ()=> { return new Date(); };

function checkLastIp(userId, email, name, ip, id) {
	userhis.findOne({user_id:mongoose.Types.ObjectId(userId), _id:{$ne:id}}, {ip_address:1}).exec(function(er1, res1) {
		if(res1) {
			let oldIp = res1.ip_address;
			if(ip != oldIp) {
				var specialVars = { '###EMAIL###':email, '###IP###':ip, '###USER###':name };
				mail.sendMail(email, 'new_ip_login', specialVars, function(mailRes) { });
			}
		}
	});
}

function Ipblock(info,res) {
	let ip = info.header('x-forwarded-for') || info.connection.remoteAddress;
	ip = ip.replace('::ffff:', '');
	var agent = useragent.parse(info.headers['user-agent']);
	var os = agent.os.toString().split(' ')[0];
	var browser = agent.toAgent().split(' ')[0];
	var search = {"ip_address": ip };
	async.parallel({
		attemptRst:function(cb) {
			loginAttempts.findOne(search).select('attemptCount').exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		if(results.attemptRst!=null) {
			loginAttempts.findOne({"ip_address":ip}).exec(function(error,resData){
				if(resData) {
					let attemptCount = resData.attemptCount + 1;
					loginAttempts.updateOne({"_id": resData._id},{ $set: {"attemptCount":+attemptCount,"status":0} }).exec(function(err,resUpdate) {
						if(resUpdate){
							if(attemptCount >= 2) {
								res.json({success:0, msg:"Our system requesting you to reset your password using forgot password link"});
							} else {
								res.json({success:0, msg:"Invalid login credentials"});
							}
						}
					});
				}
			});
		} else {
			let attempt = { "emailid":info.body.email, "secret_key":info.body.password, "ip_address":ip, "browser":browser, "deviceinfo":os, "created_at":updatedDate(), "status":0 };
			loginAttempts.create(attempt, function(err,result) {
				if(result) {
					res.json({success:0, msg:"Invalid login credentials"});
				}
			});
		}
	})
}

router.post('/forgotPassword', (req,res) => {
	try {
		let info  = req.body;
		let email = validator.isEmail(info.email);
		if(email) {
			let usermail = info.email.toLowerCase();
			var first = endecrypt.encryptNew(endecrypt.firstNewMail(usermail));
			var second = endecrypt.encryptNew(endecrypt.secondNewMail(usermail));
			users.findOne({primary_value:first, added_val:second, status:1}, {username:1}).exec(function(userErr,userRes) {
				if(userRes) {
					var encUserId = endecrypt.encryptNew(userRes.username);
					var encRandId = endecrypt.encryptNew(common.generateRandomNumber());
					users.updateOne({_id : userRes._id},{"$set":{forgot_code:encRandId}}).exec(function(upErr,upRes) {
						if(upRes) {
							var link = endecrypt.userUrl(req)+'reset_password?token='+encodeURIComponent(encUserId)+'&verify='+encodeURIComponent(encRandId);
							var specialVars = {
								'###LINK###': link,
								'###URL###': link,
								'###USER###': userRes.username
							};
							mail.sendMail(usermail, 'forgot_mail', specialVars, function(mailRes) {
								res.json({success:1});
							});
						} else {
							res.json({success:0, msg:"Please try again later"});
						}
					});
				} else {
					res.json({success:0, msg:"Email not exists"});
				}
			})
		} else {
			res.json({success:0, msg:"Enter valid email"});
		}
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.post('/resetPassword', (req, res) => {
	try {
		let info = req.body;
		let comparePwd = validator.equals(info.password, info.confirm_password);
		let tokenVal = validator.isEmpty(info.token);
		let verifyVal = validator.isEmpty(info.verify);
		let passArr = [];
		if(comparePwd && !tokenVal && !verifyVal) {
			var username = endecrypt.decryptNew(decodeURIComponent(info.token));
			users.findOne({username:username, forgot_code:decodeURIComponent(info.verify)}, {_id:1,secretkey:1}).exec(function(userErr,userRes) {
				if(userRes) {
					passArr = userRes.secretkey;
					endecrypt.hashPswd(info.password, function(encPwd) {
						endecrypt.cmpreMultiPwd(info.password, passArr, function(cmpVal) {
							if(cmpVal == 1) {
								res.json({success:3, msg:"Password should not match with last five passwords"});
							} else {
								if(userRes.secretkey.length < 5){
									passArr.push(encPwd);
								} else {
									passArr.shift();
									passArr.push(encPwd);	
								}
								users.updateOne({_id:userRes._id}, { "$set": {forgot_code:"", protect_key:encPwd, secretkey:passArr}}).exec(function(upErr,upRes) {
									if(upRes) {
										return res.json({success:1, msg:"Password updated successfully"});
									} else {
										return res.json({success:0, msg:"Failed to update password"});
									}
								});
							}
						})
					});
				} else {
					res.json({success:0, msg:"Reset password link expired"});
				}
			});
		} else if(!comparePwd) {
			res.json({success:0, msg:"Password does not match"});
		} else {
			res.json({success:0, msg:"Please enter all details"});
		}
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.get('/logout', (req,res) => {
	let token = req.headers['x-access-token'] || req.headers['authorization'];
	token = token.split(' ')[1];
	common.logout(token);
	res.json({success:1, msg:"Logged out Successfully"});
});

router.post('/resend_mail', (req,res) => {
	var userId = req.body.id;	
	users.findOne({"_id":userId}, {username:1, primary_value:1, added_val:1}).exec(function(userErr,userRes){
		if(userRes){
			var usermail = endecrypt.decryptNew(userRes.primary_value)+endecrypt.decryptNew(userRes.added_val);
			var encuId = endecrypt.encryptNew(userId.toString());
			var uri = endecrypt.frontUrl()+'activate_account?token='+encodeURIComponent(encuId);
			var specialVars = {'###LINK###': uri, '###URL###': uri, '###USER###': userRes.username};
			mail.sendMail(usermail, 'activate_mail', specialVars, function(mailRes) {
			});
			res.json({success:1, msg: 'Activation link sent to user.'});
		} else{
			res.json({success:0, msg: 'Failed to sent a link.'});
		}
	});
});

router.get('/cgeEmail', (req, res) => {
	let usrmail = "si@simonsable.com";
	var first = endecrypt.encryptNew(endecrypt.firstNewMail(usrmail));
	var second = endecrypt.encryptNew(endecrypt.secondNewMail(usrmail));
	res.json({success:1, first:first, second:second});
});

router.get('/chkMnuAlTrd/:id', (req,res) => {
	var id = req.params.id;
	orderDB.findOne({_id:mongoose.Types.ObjectId(id)}).exec(function(ordErr, ordRes) {
		if(ordRes) {
			if(ordRes.status == "active" || ordRes.status == "partially") {
				tradeHlp.chkMualTrdeTst(ordRes);
				res.json({success:1, ordRes:ordRes});
			} else {
				res.json({success:0, sts:ordRes.status});
			}
		} else {
			res.json({success:0, ordErr:ordErr});
		}
	});
});

router.get('/daily_volume', (req, res) => {
	mapDb.aggregate([
		{ $match: { cancel_id:null, datetime:{ $gte:new Date(new Date().setDate(new Date().getDate() - 1)) } } },
		{ $group: { _id: "$pair", volume:{ $sum:"$total" } } },
		{ $sort: { datetime:1 } }
		]).exec(function(trdErr, trdRes) {
			if(trdRes && trdRes.length > 0) {
				var pairs = {};
				for (var i = 0; i < trdRes.length; i++) {
					pairs[trdRes[i]._id] = parseFloat(trdRes[i].volume).toFixed(8);
				}
				res.json({success:1, pairs:pairs});
			} else {
				res.json({success:0});
			}
		});
	});

router.get('/transactions', (req, res) => {
	async.parallel({
		deps:function(cb) {
			deposit.aggregate([
				{ $match: {} },
				{ $group: { _id: "$currency", amount:{ $sum:"$amount" } } }
				]).exec(cb)
		},
		withs:function(cb) {
			withdraw.aggregate([
				{ $match: { status:"completed" } },
				{ $group: { _id: "$currency", amount:{ $sum:"$amount" } } }
				]).exec(cb)
		},
	}, function(err, resp) {
		var depRes = resp.deps;
		var withRes = resp.withs;
		var deps = {}; var withs = {};
		for (var i = 0; i < depRes.length; i++) {
			deps[depRes[i]._id] = parseFloat(depRes[i].amount).toFixed(8);
		}
		for (var i = 0; i < withRes.length; i++) {
			withs[withRes[i]._id] = parseFloat(withRes[i].amount).toFixed(8);
		}
		res.json({success:1, deposit:deps, withdraw:withs});
	});
});

router.get('/total_balance/:curr', (req, res) => {
	try {
		var curr = req.params.curr;
		currency.find({symbol:curr}).countDocuments().exec(function (err, currRes) {
			if(currRes) {
				const query = {wallet:{$elemMatch:{currency:curr, amount:{$gte:0.00000001}}}};
				calculateBal(query, function(userBal) {
					res.json({success:1, total_amount:userBal+" "+curr});
				});
			} else {
				res.json({success:0, msg:"Invalid currency"});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

function calculateBal(query, cb) {
	wallet.find(query, {"wallet.$":1, "_id":0}).exec(function(walErr, walRes) {
		if(walRes.length > 0) {
			var bSum = 0; var i = 1; var len = walRes.length;
			walRes.forEach((val) => {
				var usrBal = parseFloat(val.wallet[0]["amount"]);
				bSum = parseFloat(bSum) + usrBal;
				bSum = parseFloat(bSum).toFixed(8);
				if(i == len) { cb(bSum); }
				i = i + 1;
			});
		} else {
			cb(0);
		}
	});
}

router.get('/checkMyIp', (req, res) => {
	var ip = req.header('x-forwarded-for');
	var rem = req.connection.remoteAddress;
	res.json({success:1, ip:ip });
});

router.get('/smsSts', (req, res) => {
	var encuId = endecrypt.encryptNew("Testtt");
	var uri = endecrypt.userUrl(req)+'activate_account?token='+encodeURIComponent(encuId);
	var specialVars = { '###LINK###': uri, '###URL###': uri };
	mail.sendMail("drryansvgpvt@gmail.com", 'activate_mail', specialVars, function(mailRes) {
		console.log('mailRes', mailRes);
		res.json({success:1});
	});
});

router.get('/testSms', (req, res) => {
	let one = endecrypt.decryptNew("");
	let two = endecrypt.decryptNew("");
	res.json({success:1, one:one, two:two });
	// wallet.updateMany({}, { $pull: { wallet:{currency:"BUSD"} }}).exec(function(err, resUp) {
	// 	wallet.updateMany({}, { $push: { wallet:{currency:"USDC", amount:0} }}).exec(function(err1, resUp1) {
	// 		res.json({success:1, resUp:resUp, resUp1:resUp1});
	// 	})
	// })
});

// router.get('/testFn', (req, res) => {
// 	users.aggregate([[
// 		{ '$match': { 'referrer_id': '1141788417' } }, 
// 		{
// 			'$lookup': {
// 				'from': 'user_wallet', 
// 				'localField': '_id', 
// 				'foreignField': 'user_id', 
// 				'as': 'userwallet'
// 			}
// 		}
// 	]],function(err, resd){
// 		var details = [];
// 		for (var i = 0; i < resd.length; i++) {
// 			var json_data = {}; 
// 			if(resd[i].userwallet.length > 0) {
// 				for (var k = 0; k < resd[i].userwallet.length; k++) {
// 					for (var j = 0; j < resd[i].userwallet[k].wallet.length; j++) {
// 						if(parseFloat(resd[i].userwallet[k].wallet[j].amount) > 0) {
// 							json_data[resd[i].userwallet[k].wallet[j].currency] = parseFloat(resd[i].userwallet[k].wallet[j].amount);
// 						}
// 					}
// 				}
// 			}
// 			json_data['userid'] = resd[i]._id;
// 			details.push(json_data)
// 		}
//   	res.json({success:1, details:details});
// 	})
// });

// router.get('/testActOrd/:sts', (req, res) => {
// 	var sts = parseInt(req.params.sts);
// 	users.aggregate([[
// 		{ $match: { 'status':sts } },
// 		{
// 			$lookup: {
// 				from:'coin_order',
// 				let:{userId:'$_id'},
// 				pipeline:[{
// 					$match:{
// 						$expr:{
// 							$and:[
// 								{ $or:[{$eq:['$status', 'active']}, {$eq:['$status', 'partially']}] },
// 								{ $eq:['$user_id', '$$userId'] }
// 							]
// 						}
// 					}
// 				}],
// 				as: 'CO'
// 			}
// 		},
// 		{ $project : { _id:'$_id', username:'$username', ordId:'$CO._id' } },
// 	]],function(err, resd){
//   	res.json({success:1, resd:resd, err:err});
// 	})
// });

router.post('/subscribe', (req,res) => {
	try {
		let info = req.body;
		let email = validator.isEmail(info.email);
		var mailFrm = info.email.substring(info.email.lastIndexOf("@")+1);
		if (disposal.indexOf(mailFrm) > -1) { 
			return res.json({success:0, msg:"Invaild email"});
		}
		if(email) {
			let usermail = info.email.toLowerCase();
			subscribe.find({email: usermail}).countDocuments().exec(function(userErr,userRes) {
				if(userRes) {
					res.json({success:0, msg:"Email already subscribed"});
				} else {
					let obj = {
						email  : info.email,
						status : 1
					}
					subscribe.create(obj, function(err,resData) {
						if(resData) {
							res.json({success:1, msg:'Subscribed successfully'});
						} else {
							res.json({success:0, msg:'Please try again later.'});				
						}
					});
				}
			});
		} else {
			res.json({success:0, msg:"Please enter all details"});
		}
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.get('/logs', (req,res) => {
	var path = require('path');
	var file = path.join(__dirname, '../../logs/combined.outerr-0.log')
	res.download(file);
})

router.get('/test', (req,res) => {
	users.updateMany({}, {"$set":{acc_type : 'personal'}}).exec(function(upErr, upRes) {
		res.json({success:1, err:upErr, data:upRes});
	});
})

router.post('/liminal-sandbox', (req,res) => {
	try {
		let info = req.body;
		console.log('info', info);
		// let info = {id:128212413,txid:'0x75eb878be9156f5456ba948aa4c162116e9d26c98ff032fddbf8da5d04a9f5a0',raw:null,walletid:19868,type:'receive',fee:'0.00005261',effectivechange:'20.00000000',runningbalance:null,timestamp:'2024-03-21T08:20:20.000Z',externaladdress:'0x25f03bc4e3de9213d1effdcbd2db1c114faf69e6',block:5529867,coin:'USDT',effectivechangeusd:'20.00000',wallet:{id:19868,name:'GS Fintech Deposit ETH',type:'pipeline',config:'2of2',balance:'0.00200000',address:'0x48A5468fd71D8463dc762BB1f5B105d1dA19FDBB',coin:'ETH',chain:'ETH',parentchain:'EVM',subtype:'deposit',isArchived:0,orgid:1422,balanceUSD:'7.07674511',orgWebhook:'https://posydhejck.gs20.exchange/basic/liminal-sandbox',orgSigningKey:'52d22496-4acf-1ceb-e70d-5f6b2bad9bba'},tokenContractAddress:'0xcd1231b7a93ac62d4407C9366478AD68A3911ddc',sequenceId:'',explorerLink:'https://sepolia.etherscan.io/tx/0x75eb878be9156f5456ba948aa4c162116e9d26c98ff032fddbf8da5d04a9f5a0',inputs:[{address:'0x25f03bc4e3de9213d1effdcbd2db1c114faf69e6',amount:'0.00000000',isMine:false}],outputs:[{address:'0x5748d2ad5b31bacc48d5b5adbeed333bd1c4b5d5',amount:'20.00000000',isMine:true,wallet:{id:19868,name:'GS Fintech Deposit ETH',type:'pipeline',config:'2of2',status:1,balance:'0.00200000',balanceusd:'7.07674511',raw:null,issynced:true,walletpath:'m/44/60/0',walletidentifier:'0x48A5468fd71D8463dc762BB1f5B105d1dA19FDBB',coin:'ETH',chain:'ETH',parentchain:'EVM',subtype:'deposit',isArchived:false,teamId:null,version:1,orgid:1422,suspendedStatus:0,suspendedRemark:null}}]};
		if(info.type == 'receive') {
			liminalDeposit.find({txid: info.txid}).countDocuments().exec(function(depErr,depRes) {
				if(depRes) {
					res.json({success:0, msg:"Already exists"});
				} else {
					var contract = (info.coin == 'USDT' || info.coin == 'USDC') ? info.tokenContractAddress : '';
					var tag = (info.coin == 'XRP') ? info.raw : '';
					var obj = {'txid': info.txid, 'amount': info.effectivechange, 'coin': info.coin, 'network': info.outputs[0].wallet.coin , 'address': info.outputs[0].address, 'tag': tag, 'contract': contract, 'status' : 0}
					liminalDeposit.create(obj, function(err,resData) {
						if(resData) {
							res.json({success:1, msg:'Created successfully'});
						} else {
							res.json({success:0, msg:'Please try again later.'});				
						}
					});
				}
			});
		} else {
			res.json({success:0, msg:"Something went wrong"});			
		}
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

module.exports = router;