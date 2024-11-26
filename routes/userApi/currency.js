const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const validator = require('validator');
const async = require('async');

const cloudinary = require('../../helpers/cloudinary');
const common = require('../../helpers/common');
const encdec = require('../../helpers/newendecryption');
const p2pHlp = require('../../helpers/p2p');

const users = require('../../model/users');
const userbank = require('../../model/userbank');
const notify = require('../../model/notify');
const currency = require('../../model/currency');
const currencydetails = require('../../model/currencydetails');
const orderDb = require('../../model/CoinOrder');
const p2porderDb = require('../../model/p2pCoinOrder');
const pairsDb = require('../../model/pairs');

//upload  storage
var storage = multer.diskStorage({
	filename: function (req, file, cb) {
		cb(null, common.randomString(8) + new Date().getTime() + file.originalname);
	}
});
var upload = multer({ storage:storage });

router.get('/coindetails/', (req,res) => {
	try { 
		currency.aggregate([
		{   
			$lookup: {        
				from: "currencydetails",
				localField: "_id",
				foreignField: "currency_id",
				as: "currencydet"
			}
		},	
		{
			$project : {		
				id:{$arrayElemAt:["$currencydet._id",0]},
				coindetails:"$currencydet.details",
				name:1,
				symbol:1,
			}
		}
		]).exec(function(err_wallet, resData_wallet){ 				
			res.json({ status : true, data: resData_wallet })
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.get('/getcoindetails/:id', (req,res) => {
	try { 
		var idval = req.params.id;
		currencydetails.aggregate([
		{
			$lookup:{
				from: "currency",
				localField: "currency_id",
				foreignField: "_id",
				as: "cr"
			}
		},
		{
			$match: {
				currency_id:mongoose.mongo.ObjectId(idval),			
			}
		},
		{$unwind:"$cr"},
		{
			$project: {
				details:1,
				name:"$cr.name",
				symbol:"$cr.symbol"
			}
		}
		]).exec(function(err, resData) {
			res.json({status:true, data:resData})
		})
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.post('/getUSDPrice', (req,res) => {
	try { 
		let info = req.body;
		if(info.currency == undefined) { return res.json({success:0, msg:"Select currency"}); }
		pairsDb.findOne({from_symbol:info.currency, to_symbol:"USDC"}, {_id:0, amt_volume:1, last_price:1, high:1, low:1, volume:1, change_per:1, prc_clr:1}).exec(function(curErr, curRes) {
			if(curRes) {
				common.checkVolume(info.currency, 'USDC', (usdtVol) => {
					common.checkVolume(info.currency, 'EUR', (eurVol) => {
						res.json({success:1, data:curRes, usdtVol: usdtVol.volume, eurVol: eurVol.volume, newusdtVol: usdtVol.newvolume, neweurVol: eurVol.newvolume});
					});
				});
			}
		});
	} catch(e) {
		res.json({success:0, msg:"Something went wrong"});
	}
});

router.get('/getBanks', common.userVerify, (req,res) => {
	let info = req.body;
	let id = req.userId;
	var bankArr = [];
	userbank.find({user_id:id}, {}).sort({_id:-1}).exec(function(bankErr, bankRes) {
		if(bankRes) {
			bankRes.forEach((val) => {
				var status = (val.status == 1) ? 'Active' : 'Inactive';
				let resp = { "name":val.acc_name, "number":val.acc_number, "bank":val.bank_name, "branch":val.bank_branch, "code":val.bank_code, "currency":val.currency, "status":status, "token": encdec.encryptNew(val._id.toString())};
				bankArr.push(resp);
			});
			res.json({success:1, bank:bankArr, token:''});
		} else {
			res.json({success:0});
		}
	});
});

router.post('/bank_info', common.userVerify, (req,res) => {
	let info = req.body;
	let id = req.userId;
	userbank.findOne({user_id:id, _id:encdec.decryptNew(info.bankid.toString())}, {}).exec(function(bankErr, bankRes) {
		if(bankRes) {
			let resp = { "name":bankRes.acc_name, "number":bankRes.acc_number, "confirm":bankRes.acc_number, "type":bankRes.acc_type, "bank":bankRes.bank_name, "branch":bankRes.bank_branch, "code":bankRes.bank_code, "proof":bankRes.bank_proof, "currency":bankRes.currency };
			let bankId = encdec.encryptNew(bankRes._id.toString());
			res.json({success:1, bank:resp, token:bankId});
		} else {
			res.json({success:0});
		}
	});
});

router.post('/make_primary', common.userVerify, (req,res) => {
	let info = req.body;
	let id = req.userId;
	userbank.updateMany({user_id:mongoose.mongo.ObjectId(id), currency: info.currency}, {"$set":{status:0}}).exec(function(err, result){
		if(result) {
			userbank.updateOne({_id:encdec.decryptNew(info.bankid.toString())}, {"$set":{status:1}}).exec(function(bankErr, bankRes){
				if(bankRes) {
					res.json({success:1});
				} else {
					res.json({success:0});
				}
			});
		} else {
			res.json({success:0});
		}
	});
});

function proofUpload(req, callback) {
	var uploadImg = "";
	if(req.file != null && req.file != undefined && req.file.path != "") {
		cloudinary.uploadImage(req.file.path, function(imgRes) {
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


function checkAccnum(id, currency, number, bank_token, callback) {
	if(bank_token == "bank") {
		userbank.find({user_id:mongoose.mongo.ObjectId(id), currency: currency, acc_number: number}).countDocuments().exec(function(userErr,userRes) {
			if(userRes) {
				callback(0);
			} else {
				callback(1);
			}
		});
	} else {
		callback(1);
	}
}

function checkLimit(id, currency, bank_token, callback) {
	if(bank_token == "bank") {
		userbank.find({user_id:mongoose.mongo.ObjectId(id), currency: currency}).countDocuments().exec(function(userErr,userRes) {
			if(userRes >= 5) {
				callback(0);
			} else {
				callback(1);
			}
		});
	} else {
		callback(1);
	}
}

router.post('/updateBank', upload.single('bank_proof'), common.userVerify, (req,res) => {
	let info = req.body;
	if(validator.isEmpty(info.name)) { return res.json({success:0, msg:"Enter Account Holder Name"}); }
	if(validator.isEmpty(info.number)) { return res.json({success:0, msg:"Enter Account Number"}); }
	if(!validator.isNumeric(info.number)) { return res.json({success:0, msg:"Enter valid Account Number"}); }
	if(validator.isEmpty(info.confirm)) { return res.json({success:0, msg:"Enter Confirm Account Number"}); }
	if(!validator.equals(info.number, info.confirm)) {return res.json({success:0, msg:"Account Number does not match"});}
	if(validator.isEmpty(info.bank)) { return res.json({success:0, msg:"Enter Bank Name"}); }
	// if(validator.isEmpty(info.branch)) { return res.json({success:0, msg:"Enter Branch"}); }
	if(validator.isEmpty(info.type)) { return res.json({success:0, msg:"Select Account Type"}); }
	if(validator.isEmpty(info.currency)) { return res.json({success:0, msg:"Select currency"}); }
	if(validator.isEmpty(info.bank_token)) { return res.json({success:0, msg:"Invalid request"}); }
	let id = req.userId;
	users.findOne({_id:id}, {kyc_status:1, pro_status:1}).exec(function(usrErr, usrRes) {
		if(usrRes) {
			if(usrRes.kyc_status != 3) {
				return res.json({success:0, msg:"Please verify your KYC"});
			}
			checkLimit(id, info.currency, info.bank_token, function(bankLimit) {
				if(bankLimit) {
					checkAccnum(id, info.currency, info.number, info.bank_token, function(accNum) {
						if(accNum) {
							proofUpload(req, function(uploadImg) {
								if(uploadImg != null && uploadImg != undefined && uploadImg != "") {
									let obj = {
										"user_id"     : mongoose.mongo.ObjectId(id),
										"currency"    : info.currency,   
										"acc_name"    : info.name,
										"acc_number"  : info.number,
										"acc_type"    : info.type,
										"bank_name"   : info.bank,
										"bank_branch" : info.branch,
										"bank_code"   : info.code,
										"bank_proof"  : uploadImg,
										"status"      : 1
									};
									if(info.bank_token != "bank") {
										let bankId = encdec.decryptNew(info.bank_token);
										userbank.findOne({_id:mongoose.mongo.ObjectId(bankId), user_id:mongoose.mongo.ObjectId(id)}, {_id:1}).exec(function (resErr, resBnk) {
											if(resBnk) {
												obj['updated_at'] = new Date();
												userbank.updateOne({_id:mongoose.mongo.ObjectId(bankId)}, {"$set":obj}).exec(function(bankErr, bankRes){
													if(bankRes) {
														// users.updateOne({_id:mongoose.mongo.ObjectId(id)}, {"$set":{bank_status:1}}).exec(function(er, re){});
														let notObj = {user_id:id, category:"Bank Update", message:"You have updated bank details", page:"bankinfo"};
														notify.create(notObj, function(notErr, notRes) {});
														res.json({success:1, msg:"Bank details updated successfully", currency: info.currency});
													} else {
														res.json({success:0, msg:"Invalid request. Please Try again"});
													}
												});
											} else {
												res.json({success:0, msg:'Invalid request'});
											}
										});
									} else {
										userbank.updateMany({user_id:mongoose.mongo.ObjectId(id), currency: info.currency}, {"$set":{status:0}}).exec(function(er, re){
											userbank.create(obj, function(bankErr, bankRes) {
												if(bankRes) {
													users.updateOne({_id:mongoose.mongo.ObjectId(id)}, {"$set":{bank_status:1}}).exec(function(er, re){});
													let notObj = {user_id:id, category:"Bank Create", message:"You have added new bank details", page:"bankinfo"};
													notify.create(notObj, function(notErr, notRes) {});
													res.json({success:1, msg:"Bank details created successfully", currency: info.currency});
												} else {
													res.json({success:0, msg:"Invalid request. Please Try again"});
												}
											});
										});
									}
								} else {
									res.json({success:0, msg:"Failed to upload bank proof"});
								}
							});
						} else {
							res.json({success:0, msg:'Account number already exists'});
						}
					});
				} else {
					res.json({success:0, msg:'Your bank limit has been reached'});
				}
			});
		} else {
			res.json({success:0, msg:'Invalid User'});
		}
	});
});


router.post('/inorders', common.userVerify, (req, res) => {
	let info = req.body;
	let userId = req.userId;
	inorders({symbol:info.symbol, userId:userId}, (results) => {
		res.json({success:1, result:results.res});
	});
});

let inorders = exports.inorders = function (param, callback) {
	var userId = param.userId;
	async.parallel({
		openOrder: function(cb) {
			orderDb.find({ user_id: mongoose.mongo.ObjectId(userId), $or: [{firstCurrency: param.symbol}, {secondCurrency: param.symbol}], status: { $in:['active', 'partially', 'stoplimit']} }, {_id:0, Price:1, Amount:1, firstCurrency:1, secondCurrency:1, Type:1, order_id:1, created_at:1, status:1}).sort({_id: -1}).exec(cb)
		},
		p2popenOrder: function(cb) {
			p2porderDb.find({ user_id: mongoose.mongo.ObjectId(userId), $or: [{firstCurrency: param.symbol}, {secondCurrency: param.symbol}], status: { $in:['active', 'partially']} }, {_id:0, Price:1, Amount:1, firstCurrency:1, secondCurrency:1, Type:1, order_id:1, created_at:1, status:1}).sort({_id: -1}).exec(cb)
		},
	},function(err, results) {
		if(results) {
			formatOpen(userId, results.openOrder, 'CEX', function(cexopenRes) {
				formatOpen(userId, results.p2popenOrder, 'P2P', function(p2popenRes) {
					var openOrder = cexopenRes.concat(p2popenRes);
					callback({res:openOrder});
				});
			})
		} else {
			callback({res:[]});
		}
	})
}

function formatOpen(userId, open, ordertype, callback) {
	if(open.length > 0) {
		var opens = []; var openArr; var i = 1; let len = open.length;
		open.forEach((val) => {
			let cls = (val.Type == "buy") ? "text-success":"text-danger";
			let typ = (val.Type == "buy") ? "Buy":"Sell";
			if(ordertype == 'CEX') {
				common.checkOrderTemp(val.status, val.Type, val._id, function(filled) {
					var filledAmt = parseFloat(val.Amount) - parseFloat(filled);
					var total = filledAmt * val.Price;
					openArr = {'pair':val.firstCurrency+'/'+val.secondCurrency, 'firstCurrency':val.firstCurrency, 'secondCurrency':val.secondCurrency, 'amount':filledAmt.toFixed(8), 'price':val.Price.toFixed(8), 'total': total.toFixed(8), 'cls':cls, 'token':val.order_id, 'type': typ, 'datetime':val.created_at, 'ordertype':ordertype, 'cls':cls};
					opens.push(openArr);
				});
			} else {
				p2pHlp.checkOrderTemp(val.status, val.Type, val._id, function(filled) {
					var filledAmt = parseFloat(val.Amount) - parseFloat(filled);
					var total = filledAmt * val.Price;
					openArr = {'pair':val.firstCurrency+'/'+val.secondCurrency, 'firstCurrency':val.firstCurrency, 'secondCurrency':val.secondCurrency, 'amount':filledAmt.toFixed(8), 'price':val.Price.toFixed(8), 'total': total.toFixed(8), 'cls':cls, 'token':val.order_id, 'type': typ, 'datetime':val.created_at, 'ordertype':ordertype, 'cls':cls};
					opens.push(openArr);
				});
			}
			if(i == len) { callback(opens); }
			i = i + 1;
		});
	} else {
		callback([]);
	}
}

function formatfinal(open, callback) {

}

module.exports = router;