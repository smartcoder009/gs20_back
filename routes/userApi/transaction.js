const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const async = require('async');
const validator = require('validator');
const multer = require('multer');

const common = require('../../helpers/common');
const cloudinary = require('../../helpers/cloudinary');
const endecrypt = require('../../helpers/newendecryption');
const mail = require('../../helpers/mail');

const WAValidator = require('wallet-address-validator');
const Client = require('node-rest-client').Client;
const restCli = new Client();

//schemas
const adminBank = require('../../model/adminBank');
const users = require('../../model/users');
const userAdrs = require('../../model/userAddress');
const currency = require('../../model/currency');
const Wallet = require('../../model/userWallet');
const deposit = require('../../model/deposit');
const withdraw = require('../../model/withdraw');
const withAddr = require('../../model/withaddr');
const userBank = require('../../model/userbank');
const notify = require('../../model/notify');

//upload  storage
var storage = multer.diskStorage({
	filename: function (req, file, cb) {
		cb(null, common.randomString(8) + new Date().getTime() + file.originalname);
	}
});
var upload = multer({ storage:storage });

router.post('/fiat_info', common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	users.findOne({_id:mongoose.mongo.ObjectId(userId)}, {_id:0, kyc_status:1}).exec(function(usrErr, usrRes) {
		if(usrRes) {
			if(usrRes.kyc_status == 3) {
				async.parallel({
					currRes:function(cb) {
						currency.findOne({symbol:info.currency}, {_id:0, deposit_status:1, min_deposit:1, max_deposit:1, withdraw_fee:1}).exec(cb)
					},
					bankRes:function(cb) {
						adminBank.findOne({status:"active", currency:info.currency}, {_id:0, acc_name:1, acc_number:1, bank_name:1, bank_branch:1, bank_code:1}).exec(cb)
					},
				}, async function(err, result) {
					if(result) {
						if(result.currRes) {
							res.json({success:1, result:result.currRes, bank:result.bankRes});
						} else {
							res.json({success:0, msg:"Invalid request"});
						}
					} else {
						res.json({success:0, msg:"Something went wrong"});
					}
				});
			} else {
				res.json({success:2, msg:"Please verify your KYC"});	
			}
		} else {
			res.json({success:0, msg:"Invalid User"});
		}
	});
});

router.post('/updateFiatDeposit', upload.single('ref_img'), common.userVerify, (req,res) => {
	let info = req.body;
	if(validator.isEmpty(info.currency)) { return res.json({success:0, msg:"Select Currency"}); }
	if(validator.isEmpty(info.reference_no)) { return res.json({success:0, msg:"Enter Transaction ID"}); }
	if(validator.isEmpty(info.type)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.bank)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.amount)) { return res.json({success:0, msg:"Enter amount"}); }
	if(!validator.isNumeric(info.amount)) { return res.json({success:0, msg:"Enter valid amount"}); }
	let userId = req.userId;
	let curr = info.currency;
	let amount = parseFloat(info.amount);
	users.findOne({_id:mongoose.mongo.ObjectId(userId)}, {_id:0, username:1}).exec(function(usrErr, usrRes) {
		if(usrRes) {
			deposit.findOne({currency:curr, reference_no:info.reference_no, status:{$ne:"rejected"}}, {_id:1}).exec(function(chkErr, chkRes) {
				if(chkRes) {
					res.json({success:0, msg:"Transaction ID already exits"});
				} else {
					currency.findOne({symbol:curr, type:"fiat"}, {_id:0, status:1, min_deposit:1, max_deposit:1, withdraw_fee:1}).exec(function(curErr, curRes) {
						if(curRes) {
							if(curRes.status == 1) {
								if(amount < curRes.min_deposit) {
									return res.json({success:0, msg:"Enter minimum "+curRes.min_deposit});
								}
								if(amount > curRes.max_deposit) {
									return res.json({success:0, msg:"Enter maximum "+curRes.max_deposit});
								}
								let fee = curRes.withdraw_fee;
								var total = amount - parseFloat(fee);
								total = total.toFixed(2);
								proofUpload(req, function(uploadImg) {
									if(uploadImg != null && uploadImg != undefined && uploadImg != "") {
										var ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
										ip = ip.replace('::ffff:', '');
										let depObj = {
											user_id : mongoose.mongo.ObjectId(userId),
											amount : amount,
											reference_no : info.reference_no,
											payment_method : "Bank",
											payment_type : info.type,
											currency : curr,
											currency_type : "fiat",
											dep_bank_info : info.bank,
											status : "pending",
											ip_address : ip,
											proof : uploadImg,
											total : parseFloat(total),
											fees : parseFloat(fee),
											fee_per : (curRes.fee_type == "amount") ? 0 : curRes.fees,
										};
										deposit.create(depObj, function(depErr, depRes) {
											if(depRes) {
												let notObj = {user_id:userId, category:curr+" Deposit Request", page:"depositfiat", message:'Deposit request sent to admin for '+amount+' '+curr+' from your account'};
												notify.create(notObj, function(notErr, notRes) {});
												res.json({success:1});
											} else {
												res.json({success:0, msg:"Please try again later"});
											}
										});
									} else {
										res.json({success:0, msg:"Failed to upload reference proof"});
									}
								});
							} else {
								res.json({success:0, msg:"Invalid currency"});
							}
						} else {
							res.json({success:0, msg:"Invalid request"});
						}
					});
				}
			});
		} else {
			res.json({success:0, msg:"Invalid User"});
		}
	});
});

function proofUpload(req, callback) {
	var uploadImg = "";
	if(req.file != null && req.file != undefined && req.file.path != "") {
		cloudinary.uploadImage(req.file.path,function(imgRes) {
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

/*router.get('/receive', common.userVerify, (req,res) => {
	try {
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		users.findOne({_id:userId}, {kyc_status:1, _id:0}).exec(function(userErr,userRes) {
			if(userRes.kyc_status == 3) {
				async.parallel({
					userAddr:function(cb) {
						userAdrs.findOne({user_id:userId}, {address:1, _id:0}).exec(cb)
					},
					userWal:function(cb) {
						Wallet.findOne({user_id:userId}, {wallet:1, _id:0}).exec(cb)
					},
					currs:function(cb) {
						currency.find({status:1, type:{$ne:'fiat'}}, {symbol:1, deposit_status:1, type:1, _id:0}).exec(cb)
					},
				},function(err,results){
					if (err) { return res.json({success:0, msg:"Please try again later"}); }
					var currArr = {}; var walArr = {}; var addrArr = {};
					results.currs.forEach((val) => {
						currArr[val.symbol] = { status:val.deposit_status, type:val.type };
					});
					results.userWal.wallet.forEach((val) => {
						walArr[val.currency] = val.amount;
					});
					results.userAddr.address.forEach((val) => {
						var addrCurr = val.currency;
						if(addrCurr == "XLM" || addrCurr == "XRP"|| addrCurr == "COAL") {
							addrArr[addrCurr] = val.value+'*-*'+val.tag;
						} else {
							addrArr[addrCurr] = val.value;
						}
					});
					let receive = { address:addrArr, wallet:walArr, currency:currArr };			
					res.json({success:1, receive:receive});
				})
			} else {
				return res.json({success:2, msg:"Please verify your KYC"});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});*/

router.get('/receive', common.userVerify, (req,res) => {
	try {
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		async.parallel({
			userAddr:function(cb) {
				userAdrs.findOne({user_id:userId}, {address:1, _id:0}).exec(cb)
			},
			userWal:function(cb) {
				Wallet.findOne({user_id:userId}, {wallet:1, _id:0}).exec(cb)
			},
			currs:function(cb) {
				currency.find({status:1, type:{$ne:"fiat"}}, {_id:0, symbol:1, name:1, deposit_status:1, type:1, networks:1}).exec(cb)
			},
		},function(err,results){
			if (err) { return res.json({success:0, msg:"Please try again later"}); }
			var currArr = {}; var walArr = {}; var addrArr = {};
			results.currs.forEach((val) => {
				currArr[val.symbol] = { name:val.name, networks:val.networks, status:val.deposit_status, type:val.type };
			});
			results.userWal.wallet.forEach((val) => {
				walArr[val.currency] = val.amount;
			});
			results.userAddr.address.forEach((val) => {
				var addrCurr = val.currency;
				if(addrCurr == "COAL" || addrCurr == "XRP") {
					addrArr[addrCurr] = val.value+'*-*'+val.tag;
				} else {
					addrArr[addrCurr] = val.value;
				}
				// addrArr[val.currency] = val.value;
			});
			let receive = { address:addrArr, wallet:walArr, currency:currArr };			
			res.json({success:1, receive:receive});
		})
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.post('/createAddress', common.userVerify, (req, res) => {
	try {
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		let info = req.body;
		let currVal = validator.isEmpty(info.currency);
		if(!currVal) {
			var curr = info.currency;
			userAdrs.findOne({user_id:mongoose.mongo.ObjectId(userId)}, {address:{$elemMatch:{currency:curr}}}).exec(function(err,resData) {
				if(resData.address.length == 0) {
					var args = { data: {currency:curr}, headers: {"Content-Type":"application/json"} };
					restCli.post("http://172.31.45.154/api/address", args, function (resData, response) {
						if(resData.status == 1) {
							let addrGen = resData.address;
							let tag = resData.tag;
							let lower_address = resData.lower_address;
							var addrVal = { currency:curr, value:addrGen, lower_address:lower_address, tag:tag, secret:resData.secret, public:resData.public };
							userAdrs.update({user_id:mongoose.mongo.ObjectId(userId)}, { $push:{address:addrVal} }, {multi:true}).exec(function(adrErr,adrRes) {
								if(adrRes) {
									let adrTag = (curr == "COAL" || curr == "XRP") ? tag : "";
									return res.json({success:1, address:addrGen, tag:adrTag});
								} else {
									return res.json({success:0, msg:"Failed to update address" });
								}
							});
						} else {
							return res.json({success:0, msg:"Failed to create address" });
						}
					});
				} else {
					var tag = "";
					if(curr == "COAL" || curr == "XRP") {
						tag = resData.address[0].tag;
					}
					var addr = resData.address[0].value;
					return res.json({success:1, address:addr, tag:tag});
				}
			});
		} else {
			res.json({success:0, msg:"Invalid request"});
		}
	} catch(e) {
		res.json({success:0, msg:"Create address error"});
	}
});

router.get('/send', common.userVerify, (req,res) => {
	try {
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		users.findOne({_id:userId}, {kyc_status:1, tfa_status:1, with_pass:1}).exec(function(userErr,userRes) {
			if(userRes) {
				if(userRes.tfa_status == 0) {
					return res.json({success:2, msg:"Please enable TFA"});
				}
				if(userRes.kyc_status != 3) {
					return res.json({success:3, msg:"Please verify your KYC"});
				}
				async.parallel({
					userWal:function(cb) {
						Wallet.findOne({user_id:userId}, {wallet:1, _id:0}).exec(cb)
					},
					currs:function(cb) {	
						currency.find({status:1, type:{$ne:'fiat'}}, {symbol:1, withdraw_status:1, min_withdraw:1, max_withdraw:1, withdraw_fee:1, networks:1, _id:0}).exec(cb)
					},
				},function(err,results){
					if (err) { return res.json({success:0, msg:"Please try again later"}); }
					var currArr = {}; var walArr = {};
					results.currs.forEach((val) => {
						currArr[val.symbol] = { status:val.withdraw_status, min:val.min_withdraw, max:val.max_withdraw, fee:val.withdraw_fee, networks:val.networks };
					});
					results.userWal.wallet.forEach((val) => {
						walArr[val.currency] = val.amount;
					});
					var pwd = (userRes.with_pass == "") ? 1 : 0;
					let send = {wallet:walArr, currency:currArr, showPwd:pwd};
					res.json({success:1, send:send});
				})
			} else {
				return res.json({success:0, msg:"Invalid User"});
			}
		})
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.post('/fiatwithdraw', common.userVerify, (req,res) => {
	try {
		let info = req.body;
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		users.findOne({_id:userId}, {kyc_status:1, tfa_status:1, with_pass:1}).exec(function(userErr,userRes) {
			if(userRes) {
				userBank.findOne({user_id:userId, currency: info.currency, status:1}, {_id:0, acc_name:1, acc_number:1, bank_name:1, bank_branch:1, bank_code:1}).exec(function(bankErr, bankRes) {
					if(bankRes) {
						async.parallel({
							userWal:function(cb) {
								Wallet.findOne({user_id:userId}, {wallet:1, _id:0}).exec(cb)
							},
							currs:function(cb) {
								currency.findOne({symbol:info.currency}, {withdraw_status:1, min_withdraw:1, max_withdraw:1, withdraw_fee:1, _id:0}).exec(cb)
							},
						},function(err,results){
							if (err) { return res.json({success:0, msg:"Please try again later"}); }
							var walArr = {};
							let currArr = { status:results.currs.withdraw_status, min:results.currs.min_withdraw, max:results.currs.max_withdraw, fee:results.currs.withdraw_fee, symbol: info.currency};
							results.userWal.wallet.forEach((val) => {
								if(val.currency == info.currency) {
									walArr[val.currency] = val.amount;
								}
							});
							var pwd = (userRes.with_pass == "") ? 1 : 0;
							let send = {wallet:walArr, currency:currArr, showPwd:pwd, bank:bankRes};
							res.json({success:1, send:send});
						})
					} else {
						return res.json({success:2, msg:"Please add your bank details", page:"bankinfo"});
					}
				});
			} else {
				return res.json({success:0, msg:"Invalid User"});
			}
		})
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.post('/verifiedAddr', common.userVerify, (req,res) => {
	try {
		let info = req.body;
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		let curVal = validator.isEmpty(info.currency);
		if(curVal) {
			return res.json({success:0, msg:"Invalid Request", address:[]});
		}
		var selCurr = info.currency;
		withAddr.find({user_id:userId, currency:selCurr, status:1}, {address:1, tag:1, name:1, _id:1}).exec(function(addrErr, addrRes) {
			if(addrRes.length > 0) {
				formatAddr(selCurr, addrRes, function(addrArr) {
					res.json({success:1, address:addrArr});
				});
			} else {
				res.json({success:2, address:[]});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong", address:[]});
	}
});

function formatAddr(curr, addr, cb) {
	var addrs = [];
	var addrArr; var i = 1; var len = addr.length;
	addr.forEach((val) => {
		var tag = val.tag;
		var adrs = val.address;
		var lbl = val.name;
		var wId = endecrypt.encryptNew(val._id.toString());
		addrArr = { 'tag':val.tag, 'adrs':val.address, 'lbl':val.name, 'tkn':wId };
		addrs.push(addrArr);
		if(i == len) { cb(addrs); }
		i = i + 1;
	});
}

router.post('/deleteAddr', common.userVerify, (req, res) => {
	try {
		let info = req.body;
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		let codeVal = validator.isEmpty(info.code);
		if(codeVal) { return res.json({success:0, msg:"Invalid Request"}); }
		var code = endecrypt.decryptNew(info.code);
		users.findOne({_id:userId}, {primary_value:1, added_val:1, username:1}).exec(function(userErr,userRes) {
			if(userRes) {
				withAddr.findOne({_id:mongoose.mongo.ObjectId(code)}, {name:1, _id:1}).exec(function(addrErr, addrRes) {
					if(addrRes) {
						withAddr.deleteOne({_id:addrRes._id}).exec(function(delErr, delRes) {
							if(delRes) {
								var desc = addrRes.name;
								let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
								ip = ip.replace('::ffff:', '');
								var usermail = endecrypt.decryptNew(userRes.primary_value)+endecrypt.decryptNew(userRes.added_val);
								var specialVars = { '###DESC###': desc, '###IP###': ip, '###USER###': userRes.username };
								// mail.sendMail(usermail, 'withdraw_delete_addr', specialVars, function(mailRes) { });
								res.json({success:1, msg:"Withdraw address deleted successfully"});
							} else {
								res.json({success:0, msg:"Failed to delete address"});
							}
						});
					} else {
						res.json({success:0, msg:"Invalid Request"});
					}
				});
			} else {
				res.json({success:0, msg:"Invalid User"});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.post('/updateAddr', common.userVerify, (req,res) => {
	try {
		let info = req.body;
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		let curVal = validator.isEmpty(info.currency);
		let adrVal = validator.isEmpty(info.address);
		let desVal = validator.isEmpty(info.description);
		if(curVal || adrVal || desVal) {
			return res.json({success:0, msg:"Please enter all details"});
		}
		var selCurr = info.currency;
		var address = info.address;
		var addrTag = info.tag;
		var notes = info.description;
		users.findOne({_id:userId}, {primary_value:1, added_val:1, username:1}).exec(function(userErr,userRes) {
			if(userRes) {
				withAddr.find({user_id:userId, address:address, tag:addrTag, currency:selCurr, status:1}).countDocuments().exec(function(addrErr, addrRes) {
					if(!addrRes) {
						var apprToken = endecrypt.withEncrypt(common.randomString(14)+new Date().getTime());
						var veriToken = common.randomString(11);
						endecrypt.hashPswd(veriToken, function(encTkn) {
							let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
							ip = ip.replace('::ffff:', '');
							let addrData = {
								user_id : userId,
								currency : selCurr,
								address : address,
								tag : addrTag,
								status : 1,
								name : notes,
								ip_address : ip,
								approve_token : apprToken,
								verify_token : encTkn,
							};
							withAddr.create(addrData, function(verierr,veriRes) {
								if(veriRes) {
									res.json({success:1, msg:'Withdraw address whitelisted successfully'});
								} else {
									return res.json({success:0, msg:"Failed to add withdraw address"});
								}
							});
						});
					} else {
						res.json({success:0, msg:"Address already exists"});
					}
				});
			} else {
				return res.json({success:0, msg:"Invalid User"});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.post('/confirmAddr', common.userVerify, (req, res) => {
	try {
		let info = req.body;
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		let codeVal = validator.isEmpty(info.code);
		if(codeVal) { return res.json({success:0, msg:"Invalid Request"}); }
		var code = decodeURIComponent(info.code);
		var verCode = code.slice(0,11);
		var aprCode = code.slice(11);
		var time = new Date() - 1000 * 60 * 20;
		withAddr.findOne({user_id:userId, approve_token:aprCode, status:0, created_at:{"$gte" : new Date(time).toISOString()} }, {verify_token:1, _id:1}).exec(function(addrErr, addrRes) {
			if(addrRes) {
				endecrypt.comparePswd(verCode, addrRes.verify_token, function(verRes) {
					if(verRes) {
						withAddr.updateOne({_id:addrRes._id},{$set:{approve_token:"", status:1}}).exec(function(upErr, upRes) {
							if(upRes) {
								res.json({success:1, msg:'Withdraw address whitelisted successfully'});
							} else {
								res.json({success:0, msg:'Failed to confirm the withdraw address'});
							}
						});
					} else {
						res.json({success:0, msg:'Invalid Request'});
					}
				});
			} else {
				res.json({success:0, msg:'Invalid / Expired URL'});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.post('/sendAmount', common.userVerify, (req,res) => {
	try {
		let info = req.body;
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		let amtVal = validator.isEmpty(info.amount);
		let amtNum = validator.isNumeric(info.amount);
		let curVal = validator.isEmpty(info.currency);
		let adrVal = validator.isEmpty(info.address);
		let typVal = validator.isEmpty(info.type);
		if(amtVal || !amtNum || curVal || adrVal || typVal) {
			return res.json({success:0, msg:"Please enter all details"});
		}
		var selCurr = info.currency;
		var amount = parseFloat(info.amount);
		var address = info.address;
		var addrTag = info.tag;
		var network = (info.network) ? info.network : selCurr;
		addressBookAddr(userId, address, addrTag, selCurr, info.type, function(addrRes) {
			if(addrRes) {
				users.findOne({_id:userId, status:1}, {kyc_status:1, tfa_status:1, primary_value:1, added_val:1, username:1, withdraw_otp:1}).exec(function(userErr,userRes) {
					if(userRes) {
						if(userRes.tfa_status == 0) {
							return res.json({success:2, msg:"Please enable TFA"});
						}
						if(userRes.kyc_status != 3) {
							return res.json({success:3, msg:"Please verify your KYC"});
						}
						async.parallel({
							userWal:function(cb) {
								Wallet.findOne({user_id:userId}, {wallet:{$elemMatch:{currency:selCurr}}, _id:0}).exec(cb)
							},
							currs:function(cb) {
								currency.find({status:1, symbol:selCurr}, {withdraw_status:1, min_withdraw:1, max_withdraw:1, withdraw_fee:1, _id:0}).exec(cb)
							},
						},function(err,results){
							if (err) { return res.json({success:0, msg:"Please try again later"}); }
							var currArr = results.currs;
							var walArr = results.userWal.wallet;
							if(currArr.length == 0) { return res.json({success:0, msg:"Invalid currency"}); }
							if(walArr.length == 0) { return res.json({success:0, msg:"Invalid wallet currency"}); }
							var userBal = walArr[0].amount;
							if(userBal < amount) { return res.json({success:0, msg:"Insufficient Balance"}); }
							var minWith = parseFloat(currArr[0].min_withdraw);
							var maxWith = parseFloat(currArr[0].max_withdraw);
							if (amount < minWith || amount > maxWith) {
								return res.json({success:0, msg:"Enter amount within "+minWith+" "+selCurr+" - "+maxWith+" "+selCurr});
							}
							var feeAmt = parseFloat(currArr[0].withdraw_fee);
							var total = amount - feeAmt;
							var upBal = userBal - amount;
							var withToken = endecrypt.withEncrypt(common.randomString(10));
							let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
							ip = ip.replace('::ffff:', '');
							let withData = {
								user_id : userId,
								username : userRes.username,
								amount : amount.toFixed(8),
								transfer_amount : total.toFixed(8),
								currency : selCurr,
								status : "processing",
								payment_method : selCurr+" Payment",
								address_info : address,
								address_tag : addrTag,
								fee_amt : feeAmt.toFixed(8),
								with_token : withToken,
								ip_address : ip,
								network : network,
								approve_date : new Date()
							};
							upBal = upBal.toFixed(8);
							common.updateUserBalance(userId, selCurr, upBal, function(callRes) {
								if(callRes) {
									withdraw.create(withData, function(witherr,withRes) {
										if(withRes) {
											users.updateOne({_id:userId},{$set:{withdraw_otp:""}}).exec(function(uErr, uRes) {
												var usermail = endecrypt.decryptNew(userRes.primary_value)+endecrypt.decryptNew(userRes.added_val);
												var cnfrm = endecrypt.userUrl(req)+'?type=confirm&token='+encodeURIComponent(withToken);
												var rejct = endecrypt.userUrl(req)+'?type=reject&token='+encodeURIComponent(withToken);
												var specialVars = {
													'###LINK1###': cnfrm,
													'###LINK2###': rejct,
													'###AMT###': amount.toFixed(8) + " " + selCurr,
													'###FEE###': feeAmt.toFixed(8) + " " + selCurr,
													'###USER###': userRes.username
												};
												mail.sendMail(usermail, 'withdraw_user_confirm', specialVars, function(mailRes) {
													return res.json({success:1, bal:upBal, msg:"Withdraw request confirmation sent to your email"});
												});
											})
										} else {
											return res.json({success:0, msg:"Failed to initiate withdraw"});
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
			} else {
				return res.json({success:0, msg:"Please verify your address"});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

function addressBookAddr(userId, address, addrTag, selCurr, type, callback) {
	if(type == "temporary") {
		callback(true);
	} else {
		withAddr.findOne({user_id:userId, address:address, tag:addrTag, currency:selCurr, status:1}).exec(function(addrErr, addrRes) {
			if(addrRes) { callback(true); } else { callback(false); }
		});
	}
}

router.post('/sendFiatAmount', common.userVerify, (req,res) => {
	try {
		let info = req.body;
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		let amtVal = validator.isEmpty(info.amount);
		let amtNum = validator.isNumeric(info.amount);
		let curVal = validator.isEmpty(info.currency);
		if(amtVal || !amtNum || curVal) {
			return res.json({success:0, msg:"Please enter all details"});
		}
		var selCurr = info.currency;
		var amount = parseFloat(info.amount);
		userBank.findOne({user_id:userId, currency: info.currency, status: 1}, {_id:0, acc_name:1, acc_number:1, bank_name:1, bank_branch:1, bank_code:1}).exec(function(bankErr, bankRes) {
			if(bankRes) {
				users.findOne({_id:userId, status:1}, {kyc_status:1, tfa_status:1, primary_value:1, added_val:1, username:1}).exec(function(userErr,userRes) {
					if(userRes) {
						if(userRes.tfa_status == 0) {
							return res.json({success:2, msg:"Please enable TFA", page:"2fa"});
						}
						if(userRes.kyc_status != 3) {
							return res.json({success:2, msg:"Please verify your KYC", page:"kyc"});
						}
						async.parallel({
							userWal:function(cb) {
								Wallet.findOne({user_id:userId}, {wallet:{$elemMatch:{currency:selCurr}}, _id:0}).exec(cb)
							},
							currs:function(cb) {
								currency.find({status:1, symbol:selCurr}, {withdraw_status:1, min_withdraw:1, max_withdraw:1, withdraw_fee:1, _id:0}).exec(cb)
							},
						},function(err,results){
							if (err) { return res.json({success:0, msg:"Please try again later"}); }
							var currArr = results.currs;
							var walArr = results.userWal.wallet;
							if(currArr.length == 0) { return res.json({success:0, msg:"Invalid currency"}); }
							if(walArr.length == 0) { return res.json({success:0, msg:"Invalid wallet currency"}); }
							var userBal = walArr[0].amount;
							if(userBal < amount) { return res.json({success:0, msg:"Insufficient Balance"}); }
							var minWith = parseFloat(currArr[0].min_withdraw);
							var maxWith = parseFloat(currArr[0].max_withdraw);
							if (amount < minWith || amount > maxWith) {
								return res.json({success:0, msg:"Enter amount within "+minWith+" "+selCurr+" - "+maxWith+" "+selCurr});
							}
							var feeAmt = parseFloat(currArr[0].withdraw_fee);
							var total = amount - feeAmt;
							var upBal = userBal - amount;
							var withToken = endecrypt.withEncrypt(common.randomString(10));
							let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
							ip = ip.replace('::ffff:', '');
							let withData = {
								user_id : userId,
								username : userRes.username,
								amount : amount.toFixed(8),
								transfer_amount : total.toFixed(8),
								currency : selCurr,
								status : "processing",
								payment_method : "Bank",
								bank_info : JSON.stringify(bankRes),
								fee_amt : feeAmt.toFixed(8),
								with_token : withToken,
								ip_address : ip,
								approve_date : new Date()
							};
							upBal = upBal.toFixed(8);
							common.updateUserBalance(userId, selCurr, upBal, function(callRes) {
								if(callRes) {
									withdraw.create(withData, function(witherr,withRes) {
										if(withRes) {
											var usermail = endecrypt.decryptNew(userRes.primary_value)+endecrypt.decryptNew(userRes.added_val);
											var cnfrm = endecrypt.userUrl(req)+'withdraw?type=confirm&token='+encodeURIComponent(withToken);
											var rejct = endecrypt.userUrl(req)+'withdraw?type=reject&token='+encodeURIComponent(withToken);
											var specialVars = {
												'###LINK1###': cnfrm,
												'###LINK2###': rejct,
												'###AMT###': amount.toFixed(8) + " " + selCurr,
												'###FEE###': feeAmt.toFixed(8) + " " + selCurr,
												'###USER###': userRes.username
											};
											mail.sendMail(usermail, 'withdraw_user_confirm', specialVars, function(mailRes) {
												return res.json({success:1, bal:upBal, msg:"Withdraw request confirmation sent to your email"});
											});
										} else {
											return res.json({success:0, msg:"Failed to initiate withdraw"});
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
			} else {
				return res.json({success:2, msg:"Please add your bank details", page:"bankdetail"});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});


router.post('/resendEmail', common.userVerify, (req,res) => {
	try {
		let info = req.body;
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		let toknVal = validator.isEmpty(info.token);
		if(toknVal) { return res.json({success:0, msg:"Invalid Request"}); }
		var token = decodeURIComponent(info.token);
		withdraw.findOne({user_id:userId, with_token:token}).select("username amount currency status fee_amt").exec(function(err,resData) {
			if(resData) {
				if(resData.status != "processing") {
					var msg1 = (resData.status == "cancelled") ? "cancelled" : "confirmed";
					return res.json({success:0, msg:"Transaction already "+msg1});
				} else {
					users.findOne({_id:userId, status:1}, {kyc_status:1, tfa_status:1, primary_value:1, added_val:1, username:1}).exec(function(userErr,userRes) {
						if(userRes.tfa_status == 0) {
							return res.json({success:2, msg:"Please enable TFA"});
						}
						if(userRes.kyc_status != 3) {
							return res.json({success:3, msg:"Please verify your KYC"});
						}
						var usermail = endecrypt.decryptNew(userRes.primary_value)+endecrypt.decryptNew(userRes.added_val);
						var cnfrm = endecrypt.userUrl(req)+'?type=confirm&token='+encodeURIComponent(info.token);
						var rejct = endecrypt.userUrl(req)+'?type=reject&token='+encodeURIComponent(info.token);
						var specialVars = {
							'###LINK1###': cnfrm,
							'###LINK2###': rejct,
							'###AMT###': resData.amount.toFixed(8) + " " + resData.currency,
							'###FEE###': resData.fee_amt.toFixed(8) + " " + resData.currency,
							'###USER###': userRes.username
						};
						mail.sendMail(usermail, 'withdraw_user_confirm', specialVars, function(mailRes) {
							return res.json({success:1, msg:"Withdraw request confirmation sent to your email"});
						});
					});
				}
			} else {
				return res.json({success:0, msg:"Invalid Resend Email request"});
			}
		});
	} catch(e){
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.post('/updateSend', (req,res) => {
	try {
		let info = req.body;
		let typeVal = validator.isEmpty(info.type);
		let toknVal = validator.isEmpty(info.token);
		if(typeVal || toknVal) { return res.json({success:0, msg:"Invalid Request"}); }
		var selType = info.type;
		var token = decodeURIComponent(info.token);
		withdraw.findOne({with_token:token}).select("user_id username amount currency status fee_amt").exec(function(err,resData) {
			if(resData) {
				let userId = resData.user_id;
				if(resData.status != "processing") {
					var msg1 = (resData.status == "cancelled") ? "cancelled" : "confirmed";
					return res.json({success:0, msg:"Transaction already "+msg1});
				}
				var amount = resData.amount;
				var feeAmt = resData.fee_amt;
				var selCurr = resData.currency;
				var username = resData.username;
				var withId = resData._id;
				if (selType == "reject")  {
					common.findUserBalance(userId, selCurr, function(userBal) {
						let newBal = userBal + +amount;
						withdraw.updateOne({_id:withId}, {"$set":{status:"cancelled", cancelled_by:'user', approve_date:new Date()}}).exec(function(upErr,upRes) {
							if(upErr) { return res.json({success:0, msg:"Failed to reject withdraw"}); }
							common.updateUserBalance(userId, selCurr, newBal, function(upBal) {
								if(!userBal) {
									return res.json({success:0, msg:"Failed to update balance"});
								}
								return res.json({success:1, msg:"Withdraw request rejected"});
							})
						});
					});
				} else if (selType == "confirm")  {
					withdraw.updateOne({_id:withId}, {"$set":{status:"pending", approve_date:new Date()}}).exec(function(upErr,upRes) {
						if(upErr) { return res.json({success:0, msg:"Failed to confirm withdraw"}); }
						var withToken = endecrypt.encryptNew(withId.toString());
						var encUserId = endecrypt.encryptNew(userId.toString());
						var cnfrm = endecrypt.adminNewUrl()+'withdraw?type=confirm&token='+encodeURIComponent(withToken)+'&verify='+encodeURIComponent(encUserId);
						var rejct = endecrypt.adminNewUrl()+'withdraw?type=reject&token='+encodeURIComponent(withToken)+'&verify='+encodeURIComponent(encUserId);
						var specialVars = {
							'###LINK1###': cnfrm,
							'###LINK2###': rejct,
							'###AMT###': amount.toFixed(8) + " " + selCurr,
							'###FEE###': feeAmt.toFixed(8) + " " + selCurr,
							'###USER###': username
						};
						mail.sendMail("admin", 'withdraw_admin_confirm', specialVars, function(mailRes) {});
						return res.json({success:1, msg:"Withdraw request confirmed and request sent to admin"});
					});
				} else {
					return res.json({success:0, msg:"Invalid request type"});
				}
			} else {
				return res.json({success:0, msg:"Invalid withdraw request"});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.get('/sendOTP', common.userVerify, (req, res) => {
	try {
		let userId = req.userId;
		let validUser = validator.isMongoId(userId);
		if(!validUser) { return res.json({success:401, msg:"Unauthorized"}); }
		var withToken = common.randomString(8);
		var OTpass = endecrypt.encrypt_with(withToken)
		users.findOne({_id:userId, status:1}, {otp_prefer:1, country_code:1, primary_value:1, added_val:1, username:1, phone:1}).exec(function(userErr, userRes) {
			if (userErr) { return res.json({success:0, msg:"Please try again later"}); }
			if(userRes) {
				users.updateOne({_id:userId},{$set:{withdraw_otp:OTpass}}).exec(function(upErr, upRes) {
					if (upErr) { return res.json({success:0, msg:"Please try again later"}); }
					if(upRes.nModified == 1) {
						var specialVars = { '###USER###': userRes.username, '###OTP###': withToken };
						var usermail = endecrypt.decryptNew(userRes.primary_value)+endecrypt.decryptNew(userRes.added_val);
						mail.sendMail(usermail, 'User_withdraw_otp', specialVars, function(mailRes) {
							res.json({success:1, msg:"Withdraw OTP sent to your Email"});
						});
					}
				})
			}
		})
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
})

router.post('/updateCryptoDeposit', upload.single('ref_img'), common.userVerify, (req,res) => {
	let info = req.body;
	if(validator.isEmpty(info.currency)) { return res.json({success:0, msg:"Select Currency"}); }
	if(validator.isEmpty(info.reference_no)) { return res.json({success:0, msg:"Enter Transaction ID"}); }
	if(validator.isEmpty(info.type)) { return res.json({success:0, msg:"Invalid request"}); }
	if(validator.isEmpty(info.address)) { return res.json({success:0, msg:"Invalid request"}); }
	let userId = req.userId;
	users.findOne({_id:mongoose.mongo.ObjectId(userId)}, {_id:0, username:1}).exec(function(usrErr, usrRes) {
		if(usrRes) {
			let curr = info.currency;
			deposit.findOne({currency:curr, reference_no:info.reference_no, status:{$ne:"rejected"}}, {_id:1}).exec(function(chkErr, chkRes) {
				if(chkRes) {
					res.json({success:0, msg:"Transaction ID already exits"});
				} else {
					proofUpload(req, function(uploadImg) {
						if(uploadImg != null && uploadImg != undefined && uploadImg != "") {
							var ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
							ip = ip.replace('::ffff:', '');
							let depObj = {
								user_id : mongoose.mongo.ObjectId(userId),
								amount : 0,
								reference_no : info.reference_no,
								payment_method : curr+" Payment",
								payment_type : info.type,
								currency : curr,
								currency_type : "crypto",
								status : "pending",
								ip_address : ip,
								address_info : info.address,
								proof : uploadImg,
							};
							deposit.create(depObj, function(depErr, depRes) {
								if(depRes) {
									var specialVars = {
										'###CURRTYPE###': "Crypto",
										'###TXID###': info.reference_no,
										'###TYPE###': info.type,
										'###AMT###': "-- "+curr,
										'###USER###': usrRes.username
									};
									mail.sendMail("admin", 'user_deposit_request', specialVars, function(mailRes) { });
									let notObj = {user_id:userId, category:curr+" Deposit Request", message:'Deposit request sent to admin for '+curr+' from your account'};
									notify.create(notObj, function(notErr, notRes) {});
									res.json({success:1});
								} else {
									res.json({success:0, msg:"Please try again later"});
								}
							});
						} else {
							res.json({success:0, msg:"Failed to upload reference proof"});
						}
					});
				}
			});
		} else {
			res.json({success:0, msg:"Invalid User"});
		}
	});
});

router.post('/depoConfrmEmal', (req, res) => {
	try {
		let info = req.body;
		let userId = info.user_id;
		let amount = parseFloat(info.amount);
		let currency = info.currency;
		users.findOne({_id:mongoose.mongo.ObjectId(userId)}, {primary_value:1, added_val:1, username:1}).exec(function(userErr, userRes) {
			if (userErr) { return res.json({success:0, msg:"Please try again later"}); }
			if(userRes) {
				let specialVars = { '###USER###': userRes.username, '###AMT###': amount, '###CURR###': currency };
				let usermail = endecrypt.decryptNew(userRes.primary_value) + endecrypt.decryptNew(userRes.added_val);
				mail.sendMail(usermail, 'deposit_confirm', specialVars, function(mailRes) { });
				res.json({success:1, msg:"Deposit Confirmation email sent."});
			} else {
				res.json({success:0, msg:"Invalid User"});
			}
		})
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
})

module.exports = router;