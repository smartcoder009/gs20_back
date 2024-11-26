var express = require('express');
var multer  = require('multer');
var path = require('path');
var async  = require('async');
let common = require('../../helpers/common');
var moment = require('moment');
var router = express.Router();
var mongoose = require('mongoose');
var ipInfo = require("ipinfo");
var useragent = require('useragent');
var encdec = require('../../helpers/newendecryption');
var cloudinary = require('../../helpers/cloudinary');
var mail     = require('../../helpers/mail');
var admin = require('../../model/adminWallet');
var settings = require('../../model/siteSettings');
var profit = require('../../model/profit');
var adminhis = require('../../model/adminHistory');
var loginAttempts = require('../../model/loginAttempts');
var blockip = require('../../model/blockip');
var users = require('../../model/users');
var orderDb  = require('../../model/CoinOrder');
var withdraw = require('../../model/withdraw');
var support = require('../../model/support');
var deposit = require('../../model/deposit');
var tempDb   = require('../../model/mapping');
var pairs   = require('../../model/pairs');
var currencyDB   = require('../../model/currency');
let notify  = require('../../model/notify');
var wallet   = require('../../model/userWallet');
var validator = require('validator');
var CoinAddress = require('../../config/CoinAddress');
const speakeasy = require('speakeasy');

var Client = require('node-rest-client').Client;
var restCli = new Client();

//upload  storage
var storage = multer.diskStorage({
	filename: function (req, file, cb) {
		cb(null, file.originalname);
	}
});
var upload = multer({ storage: storage });

let updatedDate = ()=>{ return new Date(); };

let response = {};

router.get('/blockip', function(req, res, next) {
	var agent = useragent.parse(req.headers['user-agent']);
	let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
	ip = ip.replace('::ffff:', '');	
	let obj = { "ip_addr" : ip }; 
	blockip.findOne({"ip": ip }).exec(function(error,resData){
		if(resData) {
			res.json({status:false, msg:"Ip blocked"});
		} else {
			res.json({status:true, msg:"Ip not blocked"});
		}
	});		
});

router.get('/check_ip', function(req,res) {
	var agent = useragent.parse(req.headers['user-agent']);
	let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
	ip = ip.replace('::ffff:', '');
	blockip.find({"ip_addr": ip }).countDocuments().exec(function(error,resData){
		if(error){
			return res.json({success:2});
		} else if(resData != 0){
			return res.json({success:1});
		} else if(resData == 0) {
			return res.json({success:0});
		}
	});	
});

router.get('/check_maintain', function(req, res) {
	let password = encdec.encryptNew("rBGHiR%aY^Jl(Hm1UlZ");
	let pattern = encdec.encryptNew("4157862");
	return res.json({success:1, password:password, pattern:pattern});	
});

function Ipblock(info,res) { 
	let ip = info.header('x-forwarded-for') || info.connection.remoteAddress;
	ip = ip.replace('::ffff:', '');
	var agent = useragent.parse(info.headers['user-agent']);
	var os = agent.os.toString().split(' ')[0];
	var browser = agent.toAgent().split(' ')[0];

	var search = {"emailid": info.body.email };
	async.parallel({
		attemptRst:function(cb) {
			loginAttempts.findOne(search).select('attemptCount').exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		if(results.attemptRst!=null) { 
			if(results.attemptRst.attemptCount > 2) {   
				let object = {
					"ip_addr"   :ip,
					"created_at":updatedDate(),
					"status"    : 2
				}         
				blockip.create(object,function(err,result){
					if(result) {
						response.status= 401;  
						response.error = "Ip blocked" 
						res.json(response) 
					}
				});
			} else {         
				loginAttempts.findOne({"ip_address":ip}).exec(function(error,resData){
					if(resData) {            
						let attemptCount = resData.attemptCount + 1;             
						loginAttempts.updateOne({"_id": resData._id},{ $set: {"attemptCount":+attemptCount,"status":0} }).exec(function(err,resUpdate) {               
							if(resUpdate) {
								response.status= false; 
								response.error = "Invaild Email/Password or Pattern"  
								res.json(response)  
							}
						});              
					}
				});                            
			}
		} else {
			let attempt={
				"emailid":info.body.email,
				"secret_key":info.body.password,
				"ip_address":ip,
				"browser":browser,
				"deviceinfo":os,
				"status":0,
				"datetime":updatedDate()
			}
			loginAttempts.create(attempt, function(err,result){               
				if(result) {
					response.status    = false; 
					response.error = "Invaild Email/Password or Pattern"  
					res.json(response)  
				}
			}); 
		} 
	})
}

/* check admin login status. */
router.post('/chklogin', function(req, res, next) {
	let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
	ip = ip.replace('::ffff:', '');
	var agent = useragent.parse(req.headers['user-agent']);
	var os = agent.os.toString().split(' ')[0];
	var browser = agent.toAgent().split(' ')[0];
	let ownermail = req.body.email;
	let password = encdec.encryptNew(req.body.password);
	let pattern = encdec.encryptNew(req.body.pattern);

	admin.findOne({$and:[{ ownermail:ownermail, ownerkey:password, pattern:pattern }]}).exec(function (error, resData) {
		if (error) {
			return res.json({ status : 0, error : "Something went wrong" });
		}
		if(resData) {
			if(resData.status==1) {	

				var adminId = resData._id;
				var encAdminId = encdec.encryptNew(adminId.toString());
				if(resData.tfa_status == 1) {
					return res.json({status:2, ttoken:encodeURIComponent(encAdminId)});
				} else {
					let obj = {
						"adminId": resData._id,			  
						"ipaddress" : ip,
						"browser"   : browser,
						"deviceinfo": os,
						"status"    : 2 
					};
					adminhis.create( obj, function(err,result) {
						let  Key = common.createPayload(resData._id);
						if(result) {
							loginAttempts.findOneAndRemove({"emailid":resData.ownermail}).exec(function(error,resData1){
								if(resData1) {
									res.json({status:1, Key: Key, session : resData._id, name : resData.username, role : resData.role,access_module:resData.access_module,success: 'You are logging in. Please Wait.'});
								} else {
									res.json({status:1, Key: Key, session : resData._id, name : resData.username, role : resData.role, success: 'You are logging in. Please Wait.'});
								}
							});
						}
					});
				}
			} else if(resData.status == 0){
				res.json({ status : 0, error : "Your Account is deactivated!" });
			} 
		} else {
			Ipblock(req,res)			
		}
	});			
});

router.post('/tfaLogin', function(req, res, next) {
	try{
		var info = req.body;
		var userId = encdec.decryptNew(decodeURIComponent(info.ttoken));
		admin.findOne({"_id":userId}).exec(function(err,resData){
			if(resData) {
				var verified = speakeasy.totp.verify({
					secret  : resData.tfa_code,
					encoding: 'base32',
					token   : info.tfa,
					window  : 1
				});
				if(verified == true){
					let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
					ip = ip.replace('::ffff:', '');
					var agent = useragent.parse(req.headers['user-agent']);
					var os = agent.os.toString().split(' ')[0];
					var browser = agent.toAgent().split(' ')[0];
					
					let obj = {
						"adminId"	: resData._id,			  
						"ipaddress" : ip,
						"browser"   : browser,
						"deviceinfo": os,
						"status"    : 2 
					};
					adminhis.create( obj, function(err,result) {
						let  Key = common.createPayload(resData._id);
						if(result) {
							loginAttempts.findOneAndRemove({"emailid":resData.ownermail}).exec(function(error,resData1){
								if(resData1) {
									res.json({status:1, Key: Key, session : resData._id, name : resData.username, role : resData.role,access_module:resData.access_module,success: 'You are logging in. Please Wait.'});
								} else {
									res.json({status:1, Key: Key, session : resData._id, name : resData.username, role : resData.role, success: 'You are logging in. Please Wait.'});
								}
							});
						}
					});
				} else {
					res.json({status: 2, error : "Invalid 2FA Code"});
				}
			} else {
				res.json({status: 2, error : "Invalid 2FA Code"});
			}
		});
	} catch(e) {
		console.log("loginverifytfq",e);
	}  
});

router.get('/profile',common.tokenMiddleware, (req,res) => {
	let id = req.userId;
	admin.findOne({"_id": id},{ownermail:1,username:1,profileimg:1,tfa_status:1,tfa_code:1,tfa_url:1}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	});
});

router.get('/moduleaccess',common.tokenMiddleware, (req,res) => {
	let id = req.userId;
	admin.findOne({"_id": id}).select("access_module role").exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	})
})

router.get('/admin_access',common.tokenMiddleware, (req,res) => {
	let id = req.userId;
	admin.findOne({"_id": id},{_id:0}).select("access_module role").exec(function(error,resData){
		if (error) {
			return res.json({status : false});
		}
		if(resData){			
			res.json({status : true, data : resData });
		}
	})
})

router.post('/updateProfile',common.tokenMiddleware,upload.single('profileImg'), function (req,res) {
	let info = req.body;
	uploadProfile(req, function(value){
		updateProfile(info,value,req,res);
	});
});

function uploadProfile(req,callback) {
	var uploadImg = "";
	if(typeof req.file != 'undefined' && typeof req.file != undefined && req.file.path != "") {
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

function updateProfile(info,uploadImg,req,res) {
	let obj = {
		"username" : info.username,
		"modifiedDate" : updatedDate()
	};
	if(typeof uploadImg != 'undefined' && typeof uploadImg != undefined) {
		obj["profileimg"] = uploadImg;
	}	
	admin.findOneAndUpdate({ "_id": info._id}, { $set: obj},{multi: true}).exec(function(err, resUpdate){
		if(resUpdate) {			
			res.json({status : true, msg : "Successfully updated", data : uploadImg});
		} else {
			res.json({status : false, msg : "Invalid request. Please Try again"});
		}
	});
}

router.post('/loghistory', function(req, res, next) {
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
	var regex = new RegExp(filter, "i");
	if(filter !="") {
		var fl = filter.toLowerCase();			
		if(moment(filter, "YYYY-MM-DD h:mm:ss").isValid()) {
			var newDate = "";
			var newDate1 = "";
			var searchDate = new Date(filter);
			var srdate = new Date(filter);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();																
			search = {$or:[{'ipaddress': regex}, 
			{'browser': regex},{'deviceinfo': regex},{'datetime': { $gte: new Date(newDate), $lt: new Date(newDate1)}}]};
		}else{
			search = {$or:[{'ipaddress': regex}, 
			{'browser': regex},{'deviceinfo': regex}]};
		}								 
	}	else {
		search = {$or:[{'ipaddress': regex}, 
		{'browser': regex},{'deviceinfo': regex}]};	
	}	
	async.parallel({
		logCount:function(cb) {
			adminhis.find(search).countDocuments().exec(cb)
		},
		logData:function(cb) {
			adminhis.find(search, {ipaddress:1,browser:1,deviceinfo:1,datetime:1 }, query).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		response.status    = true;
		response.data      = results.logData;
		response.logCount = results.logCount;
		res.json(response);
	})
});

router.get('/settings', (req,res) => {
	settings.findOne({}).exec(function(error,resData){
		if (error) {
			return res.json({status : false});
		}
		if(resData){
			res.json({status : true, data : resData });
		} 
	})
})

router.get('/get_site', (req,res) => {
	settings.findOne({},{_id:0,site_name:1,facebook:1,twitter:1,linkedin:1,copyright:1,telegram:1}).exec(function(error,resData){
		if (error) {
			return res.json({status : false});
		}
		if(resData){
			res.json({status : true, data : resData });
		} 
	})
})

router.get('/get_contact', (req,res) => {
	settings.findOne({},{_id:0,contact_mail:1,contactnumber:1,address:1}).exec(function(error,resData){
		if (error) {
			return res.json({status : false});
		}
		if(resData){
			res.json({status : true, data : resData });
		} 
	})
})

// update settings
router.post('/site_settings',common.tokenMiddleware, function(req, res, next) {
	let info = req.body;
	info.updated_at=updatedDate();
	settings.updateOne({_id: info._id},{$set : info}).exec(function(err,results){
		if(results){								
			res.json({ status : true, msg : "Succesfully updated", data:info });				
		} else { 
			res.json({ status : false, msg : "Something went wrong. Please try again" });
		}
	});
});

router.post('/updatePass',common.tokenMiddleware, (req,res) => {
	var request = req.body;
	let userId = req.userId;
	admin.findOne({"_id": userId}).select("ownerkey").exec(function(PassErr,PassRes){      
		if(PassRes)
		{
			let encryptedcurpass = encdec.encryptNew(request.curpass);   
			if(PassRes.ownerkey == encryptedcurpass) {
				let encryptepass = encdec.encryptNew(request.newpass);   
				admin.findOneAndUpdate({ "_id": userId},{ "$set": {"ownerkey" : encryptepass}},{multi: true}).exec(function(err, resUpdate){
					if(resUpdate) {
						res.json({
							status : true,
							msg    : "Successfully updated",
							id     : userId
						});
					} else {
						res.json({
							status : false,
							msg    : "Password is not updated. Please Try again"
						});
					}
				});
			} else {
				res.json({
					status : false,
					msg    : "Current password is wrong"
				});
			}
		}
	});	
});

router.post('/updatePat',common.tokenMiddleware, (req,res) => {
	var request = req.body;
	let userId = req.userId;
	admin.findOne({"_id": userId}).select("pattern").exec(function(PassErr,PassRes){      
		if(PassRes)
		{
			let encryptedcurpattern = encdec.encryptNew(request.curpattern);   
			if(PassRes.pattern == encryptedcurpattern) {
				let encryptepattern = encdec.encryptNew(request.newpattern);   
				admin.findOneAndUpdate({ "_id": userId},{ "$set": {"pattern" : encryptepattern}},{multi: true}).exec(function(err, resUpdate){
					if(resUpdate) {
						res.json({
							status : true,
							msg    : "Successfully updated",
							id 	   :userId 
						});
					} else {
						res.json({
							status : false,
							msg    : "Pattern is not updated. Please Try again"
						});
					}
				});
			} else {
				res.json({
					status : false,
					msg    : "Current Pattern is wrong"
				});
			}
		}
	});	
});

router.post('/chkreset',common.tokenMiddleware, (req,res) => {
	var request = req.body;
	admin.findOne({"reset_code": request.rest_code }).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData) {
			res.json({status : true});		
		} else {
			res.json({status : false, msg : 'Invalid Link'});		
		}
	})
})

//admin & subadmin change pattern
router.post("/changepattern",common.tokenMiddleware, (req, res) => {
	var data=new admin(req.body)  
	admin.updateOne({"_id":req.userId},
		{$set:{"pattern":req.body.newpattern}},function(err,respat){
			admin.findOne({"_id":req.userId}).exec(function(err,adpat){
				if (err) return res.json(errresponse);
				res.json({success:true, "data":adpat});
			});
		});
});

router.get('/getBalance',common.tokenMiddleware, (req, res) => {
	currencyDB.find({status:1, type:{$ne:'fiat'}}).select('symbol type networks').exec(function(err,resData){
		if(resData) {
			res.json({status: true, data: resData}) 
		}
	})
});

router.get('/address/:cur/:net',common.tokenMiddleware, (req, res) => {
	let currency = req.params.cur;
	let network = req.params.net;
	var ethToks = ['BUSD'];
	var trxToks = ['USDT'];
	var coalToks = ['GUSD', 'GGBP', 'GEUR', 'GRMB', 'DUSD', 'EBMA'];
	var ethCurr = ethToks.indexOf(currency);
	var trxCurr = trxToks.indexOf(currency);
	var coalCurr = coalToks.indexOf(currency);
	var addrCurr = currency;
	if(ethCurr > -1) { addrCurr = 'ETH'; }
	if(trxCurr > -1) { addrCurr = 'TRX'; }
	if(coalCurr > -1) { addrCurr = 'COAL'; }
	if(CoinAddress[network]) {
		let addr = CoinAddress[network].address;	
		var args = { data: {currency:currency, network: network}, headers: {"Content-Type":"application/json"} };
		restCli.post("http://172.31.45.154/api/balance", args, function (resData, response) {
			if(resData.status == 1) {
				let balance = resData.result;
				res.json({ status:true, data:addr,	balance:balance });
			} else {
				res.json({ status: false });
			}
		});
	}	
})

router.get('/getCurrency',common.tokenMiddleware, (req, res) => {
	currencyDB.find({status:1, type:{$ne:'fiat'}}).select('symbol type networks').exec(function(err,resData){
		if(resData) {
			res.json({status: true, data: resData}) 
		}
	})
});


router.get('/getBalances',common.tokenMiddleware, (req, res) => {
	var currArr = [];
	currencyDB.find({status:1, type:{$ne:'fiat'}}).select('symbol networks').exec(function(err,curData){
		if(curData && curData.length > 0) {
			formatResponse(curData, function(resp) {
				res.json({ status:true, data:resp});
			});
		}
	});
})

function formatResponse(curData, cb) {
	var balArr; var currBals = []; var i = 1; var len = curData.length;
	curData.forEach((curr) => {
		let sym = curr.symbol;
		var args = { data: {currency:sym}, headers: {"Content-Type":"application/json"} };
		restCli.post("http://172.31.45.154/api/balance", args, function (resData, response) {
			if(resData.status) {
				balArr = { "symbol":sym, "balance":resData.result};
			} else {
				balArr = { "symbol":sym, "balance":0};
			}
			currBals.push(balArr);
			if(i == len) { cb(currBals.reverse()); }
			i = i + 1;
		});
	});
}

router.post('/updateAdminTfa', common.tokenMiddleware,(req, res) => {
	try {
		let info = req.body;
		let status; let usermail;
		admin.findOne({"_id": req.userId},{_id:0}).exec(function(err,adminRes){
			var verified = speakeasy.totp.verify({
				secret  : adminRes.tfa_code,
				encoding: 'base32',
				token   : info.admin_code.tfa_code
			});
			usermail = adminRes.ownermail;
			if(verified) {
				if(adminRes.tfa_status == 0){
					var updateVal = { tfa_status:1, tfa_update:updatedDate() };
					var updatedRule = { tfa_status:1 };
					status = 'enabled';
				} else {
					var qrName = `GS20Exchange (${usermail})`;
					var secret = speakeasy.generateSecret({length:10, name:qrName});
					var tfaCode = secret.base32;
					var tfaUrl = secret.otpauth_url;
					var url = tfaUrl.replace(tfaCode, "");
					var updateVal = { tfa_status:0, tfa_code:tfaCode, tfa_url:encdec.getQrUrl(tfaUrl)};
					var updatedRule = { tfa_status:0, tfa_code:tfaCode, tfa_url:encdec.getQrUrl(tfaUrl)};
					status = 'disabled';
				}
				admin.updateOne({"_id":req.userId}, {"$set":updateVal}).exec(function(err, upRes) {
					if(err) {
						return res.json({ status:false, result:"Please try again" });
					}
					res.json({ status:true, result:updatedRule });
				});
			} else {
				res.json({ status:false, result:"Invalid 2FA Code" });
			}
		});
	} catch(e) {
		res.status(401).send('unauthorized')
	}
});

module.exports = router;