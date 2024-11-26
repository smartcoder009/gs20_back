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
var token = require('../../model/token');
var admin = require('../../model/admin');
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
var p2porderDb = require('../../model/p2pCoinOrder');
var p2pdisputeDb = require('../../model/p2pDispute');
var p2ptempDb = require('../../model/p2pOrdertemp');
const speakeasy = require('speakeasy');

var validator = require('validator');
//upload  storage
var storage = multer.diskStorage({
	filename: function (req, file, cb) {
		cb(null, file.originalname);
	}
});
var upload = multer({ storage: storage });

let updatedDate = ()=>{
	return new Date();
};

let response = {};

router.get('/updatePairs', function (req,res) {
	let obj = {
		"price": 0,
		"usdprice": 0,
		"change": 0,
		"volume": 0,
		"high": 0,
		"low": 0
	}
	pairs.update({ status: 1 }, { $set: obj },{multi: true}, function(err, updated) {
		return res.json({ user: updated });
	})
});

router.get('/blockip', common.originMiddle, function(req, res, next) {
	// console.log(encdec.decryptNew("KKNrrWDfg7189r2RI6CjmQ=="))
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

router.get('/check_ip', common.originMiddle, function(req,res) {
	var agent = useragent.parse(req.headers['user-agent']);
	let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
	ip = ip.replace('::ffff:', '');
	blockip.find({"ip_addr": ip }).countDocuments().exec(function(error,resData){
		if(error){
			return res.json({success:2});
		}else if(resData != 0){
			return res.json({success:1});
		}else if(resData == 0) {
			return res.json({success:0});
		}
	});	
});

router.get('/check_maintain', common.originMiddle, function(req, res) {
	var agent = useragent.parse(req.headers['user-agent']);
	let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
	ip = ip.replace('::ffff:', '');
	blockip.findOne({"ip_addr":ip}).exec(function(error,resData){
		if(resData){
			return res.json({success:2});
		} else {
			return res.json({success:1});
	 	// 	settings.findOne({}).exec(function(err,site){
	 	// 		if(site.sitemode == "0") {						
	 	// 			return res.json({success:3});
			// 	} else {
			// 		return res.json({success:1});
			// 	}
			// });
		}
	});		
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
			if(results.attemptRst.attemptCount > 4) {   
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
						loginAttempts.updateOne({"_id": resData._id},{ $set: {"attemptCount":+attemptCount,"status":0} }).exec(function(err,resUpdate) { });
					}
					response.status= false; 
					response.error = "Invaild Email/Password or Pattern"  
					res.json(response)
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
router.post('/chklogin', common.originMiddle, function(req, res, next) {
	let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
	ip = ip.replace('::ffff:', '');
	var agent = useragent.parse(req.headers['user-agent']);
	var os = agent.os.toString().split(' ')[0];
	var browser = agent.toAgent().split(' ')[0];
	let ownermail = req.body.email;
	let password = encdec.encryptNew(req.body.password);
	let pattern = encdec.encryptNew(req.body.pattern);

	admin.findOne({$and:[{ ownermail : ownermail, ownerkey : password, pattern : pattern }]}).exec(function (error, resData) {
		if (error) {
			return next(error);
		}
		if(resData) {
			if(resData.status==1){		
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
						"status"    : 1 
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
			} else if(resData.status==0){
				response.status= false; 
				response.error = "Your Account is deactivated.Please contact Admin!"  
				res.json(response)  
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

router.get('/profile', common.tokenMiddleware, (req,res) => {
	let id = req.userId;
	admin.findOne({"_id": id},{ownermail:1,username:1,profileimg:1, tfa_status:1, tfa_url:1, tfa_code:1}).exec(function(error,resData) {
		if(resData){
			res.json({status:true, data : resData });
		} else {
			return res.json({status : false});
		}
	});
});

router.get('/moduleaccess', common.tokenMiddleware, (req,res) => {
	let id = req.userId;
	admin.findOne({"_id": id}).select("access_module role").exec(function(error,resData) {
		if(resData){
			res.json({status : true, data : resData });
		} else {
			return res.json({status : false});
		}
	})
})

router.get('/admin_access', common.tokenMiddleware, (req,res) => {
	let id = req.userId;
	admin.findOne({"_id": id},{_id:0}).select("access_module role").exec(function(error,resData){
		if(resData){			
			res.json({status : true, data : resData });
		} else {
			return res.json({status : false});
		}
	})
})

router.post('/updateProfile', common.tokenMiddleware, upload.single('profileImg'), function (req,res) {
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
	let obj = { "username" : info.username, "modifiedDate" : updatedDate() };
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

router.post('/loghistory', common.originMiddle, function(req, res, next) {
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
			// switch(fl) {
			// case 'success':
			// search = {'status':1}; break;
			// case 'failed':
			// search = {'status':0}; break;
			// case 'blocked':
			// search = {'status':2}; break;
			// default:		
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
			} else{
				search = {$or:[{'ipaddress': regex}, 
				{'browser': regex},{'deviceinfo': regex}]};
			}								 
		} else {
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

router.get('/settings', common.originMiddle, (req,res) => {
	settings.findOne({}).exec(function(error,resData){
		if(resData){
			res.json({status : true, data : resData });
		} else {
			return res.json({status : false});
		}
	})
})

router.get('/get_site', common.originMiddle, (req,res) => {
	settings.findOne({},{_id:0,site_name:1,facebook:1,twitter:1,linkedin:1,contact_mail:1,copyright:1,telegram:1}).exec(function(error,resData){
		if(resData){
			res.json({status : true, data : resData });
		} else {
			return res.json({status : false});
		}
	})
})

router.get('/get_contact', common.originMiddle, (req,res) => {
	settings.findOne({},{_id:0,contact_mail:1,contactnumber:1,address:1,singleToken:1,multipleToken:1,singleCoin:1,multipleCoin:1}).exec(function(error,resData){
		if(resData){
			res.json({status : true, data : resData });
		} else {
			return res.json({status : false});
		}
	})
})

// update settings
router.post('/site_settings', common.tokenMiddleware, function(req, res, next) {
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

router.post('/updatePass', common.tokenMiddleware, (req,res) => {
	var request = req.body;
	let userId = req.userId;
	admin.findOne({"_id": userId}).select("ownerkey").exec(function(PassErr,PassRes){      
		if(PassRes) {
			let encryptedcurpass = encdec.encryptNew(request.curpass);   
			if(PassRes.ownerkey == encryptedcurpass) {
				let encryptepass = encdec.encryptNew(request.newpass);   
				admin.findOneAndUpdate({ "_id": userId},{ "$set": {"ownerkey" : encryptepass}},{multi: true}).exec(function(err, resUpdate){
					if(resUpdate) {
						res.json({ status : true, msg : "Successfully updated", id : userId });
					} else {
						res.json({ status : false, msg : "Password is not updated. Please Try again" });
					}
				});
			} else {
				res.json({ status : false, msg : "Current password is wrong" });
			}
		}
	});	
});

router.post('/updatePat', common.tokenMiddleware, (req,res) => {
	var request = req.body;
	let userId = req.userId;
	admin.findOne({"_id": userId}).select("pattern").exec(function(PassErr,PassRes){      
		if(PassRes) {
			let encryptedcurpattern = encdec.encryptNew(request.curpattern);   
			if(PassRes.pattern == encryptedcurpattern) {
				let encryptepattern = encdec.encryptNew(request.newpattern);
				admin.findOneAndUpdate({ "_id": userId},{ "$set": {"pattern" : encryptepattern}},{multi: true}).exec(function(err, resUpdate){
					if(resUpdate) {
						res.json({ status : true, msg : "Successfully updated", id : userId });
					} else {
						res.json({ status : false, msg : "Pattern is not updated. Please Try again" });
					}
				});
			} else {
				res.json({ status : false, msg : "Current Pattern is wrong" });
			}
		}
	});	
});

router.post('/chkreset', common.tokenMiddleware, (req,res) => {
	var request = req.body;
	admin.findOne({"reset_code": request.rest_code }).exec(function(error,resData){
		if(resData) {
			res.json({status : true});		
		} else {
			res.json({status : false, msg : 'Invalid Link'});		
		}
	})
})

// fetch bank details
router.post('/profit', common.tokenMiddleware, (req,res) => {
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
	var cnt;
	if(search != ""){
		var newDate = "";
		var newDate1 = "";
		if(moment(search, "YYYY-MM-DD h:mm").isValid()) {
			var searchDate = new Date(search);
			var srdate = new Date(search);
			searchDate.setDate( searchDate.getDate());
			srdate.setDate( srdate.getDate() + 1 ); 
			newDate = searchDate.toISOString();
			newDate1 = srdate.toISOString();				
		}
		cnt = {$or:[{'username': { $regex: '.*' + search + '.*',$options: 'i' }},{'country': { $regex: '.*' + search + '.*',$options: 'i' }},{'type': { $regex: '.*' + search + '.*',$options: 'i' }}, {'currency': { $regex: '.*' + search + '.*',$options: 'i' }}]};

		search = parseFloat(search);
		if(search >= 0){
			if((newDate) && (newDate1)){
				cnt['$or'].push({'amount': { $eq: parseFloat(search)}},
					{'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}}); 
			} else{
				cnt['$or'].push({'amount': { $eq: parseFloat(search)}}); 
			}
		}
	} else {
		cnt = {};
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
		profitCount:function(cb) {
			profit.find(cnt).countDocuments().exec(cb);
		},
		profitData :function (cb){
			profit.aggregate([
				{ $lookup: {
					from: "user_info",
					localField: "user_id",
					foreignField: "_id",
					as: "users"
				}},							
				{
					$project : {
						_id : 0,
						"amount": "$amount",
						"type": "$type",
						"currency": "$currency",
						"created_at": "$created_at",
						"username": {$arrayElemAt:["$users.username",0]},
						"country": {$arrayElemAt:["$users.country",0]},
					}
				},
				{$match: cnt},
				{ "$sort": srt },
				{ "$skip": skip },
				{ "$limit": size }
				]).exec(cb) 
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		response.status    = true;
		response.data      = results.profitData;
		response.profitCount = results.profitCount;
		res.json(response);
	})
})

router.post('/addSubadmin', (req,res) => {
	var info = req.body;
	admin.findOne({$or:[{ownermail:info.email}, {username:info.username}]}).exec(function(error,existData) {
		if (error) {
			res.json({ status : false, msg : "Email/Username already exist!" });
		}
		if(existData) {
			res.json({ status : false, msg : "Email/Username already exist!" });
		} else {
			let password = encdec.encryptNew(info.token);			
			let pattern  = encdec.encryptNew(info.patternlock);
			var obj = {
				"username": info.username,
				"ownermail": info.email,
				"ownerkey": password,
				"role": 2,
				"access_module": info.access,
				"status": info.status,
				"pattern": pattern 
			};
			admin.create( obj, function(err,result) {      
				if(result) {
					var to = info.email;
					var specialVars = {
						'###USER###'      : info.username,
						'###CREATED_AT###': moment().format('ll')							
					};
					mail.sendMail(to,'create_subadmin',specialVars,function(mailRes) { });
					res.json({ status : true, msg : "Successfully created" });
				} else {
					res.json({ status : false, msg : "Something went wrong. Please try again"});
				}
			});
		}
	});
});

router.get('/subadmin', common.tokenMiddleware, (req,res) => {
	admin.find({role:2}).sort({createdDate: -1}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });		
	});	
});

// router.get('/editSubadmin/:id', common.tokenMiddlware, (req,res) => {
// 	 try{
// 	    var id = req.params.id;
// 	    admin.find({"_id":id}).exec(function(err,resData){
// 	    	if (err) { return res.json({success:0, msg:"Please try again later"}); }
// 			res.json({success : 1, data : resData });
// 	  });
// 	  }catch (e) {
// 		  res.json({success:401});
// 		}
// 	});

router.get('/editSubadmin/:id', common.originMiddle, (req,res) => {
	var id = req.params.id;
	admin.findOne({"_id": id}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		} else {
			res.json({status : false, msg : "Invalid request. Please Try again" });
		}
	})
});

router.post('/updateSubadmin', common.tokenMiddleware, (req,res) => {
	let info = req.body;
	let obj = { "access_module" : info.access, "modifiedDate" : updatedDate() };
	admin.updateOne({ "_id": info._id},{ "$set": obj }).exec(function(err, resUpdate){
		if(resUpdate.nModified == 1) {
			response = {status : true, msg : "Successfully updated"};
		} else {
			response = {status : false, msg : "Invalid request. Please try again"};
		}
		res.json(response);	
	});
});

router.post('/adminStatus',common.tokenMiddleware, (req,res) => {
	let info = req.body;
	let sts = info.status==1?0:1;
	let obj = { "status" : sts, "modifiedDate" : updatedDate() };
	admin.findOneAndUpdate({ "_id": info._id},{ "$set": obj },{multi: true}).exec(function(err, resUpdate){
		if(resUpdate) {
			response = {status : true, msg : "Successfully updated"};
		} else {
			response = {status : false, msg : "Invalid request. Please try again"};
		}
		res.json(response);	
	});
});

router.post('/tokenStatus', common.tokenMiddleware,upload.single('logo'), function (req,res) {
	var data = req.body;
	if(data.status == 2) {
		token.findOneAndUpdate({ "_id": JSON.parse(data._id)}, { $set: {status:2}},{multi: true}).exec(function(err, resUpdate){
			if(resUpdate) {			
				var note = {'user_id':resUpdate.user_id, 'message':'Your '+resUpdate.token_name+' token has been rejected by admin', 'category':'New Token'}
				notify.create(note, function (err, postRes) { });
				res.json({status : true, msg : "Successfully updated"});
			} 
		})
	} else {
		currencyDB.findOne({ "symbol" : {$regex:new RegExp(JSON.parse(data.token_symbol), "i")}}).exec(function(err, resCheck){
			if(!resCheck) {
				var info = {};
				info._id = JSON.parse(data._id);
				info.market = JSON.parse(data.market);
				info.decimal = JSON.parse(data.decimal);
				info.status = JSON.parse(data.status);
				info.coin_website = JSON.parse(data.coin_website);
				info.annoucements= JSON.parse(data.annoucements);
				info.githubLink = JSON.parse(data.githubLink);
				info.explorerLink = JSON.parse(data.explorerLink);
				info.token_name = JSON.parse(data.token_name);
				info.token_symbol = JSON.parse(data.token_symbol);
				info.basecoin = JSON.parse(data.basecoin);
				info.contract_address = JSON.parse(data.contract_address); 
				info.logo=data.logo;
				uploadLogo(req, function(value){
					updateStatus(info,value,req,res);
				});
			} else {
				return res.json({ success : false,  msg : JSON.parse(data.token_symbol)+' name already exists'});
			}
		})
	}
});

function uploadLogo(req,callback) {
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

function updateStatus(info,uploadImg,req,res) {
	var obj = {
		"token_name":info.token_name,
		"contract_address":info.contract_address,
		"token_symbol":info.token_symbol, 		
		"basecoin" :info.basecoin, 
		"decimal":info.decimal,
		"market": info.market,
		"status"  :info.status,
		"coin_website":info.coin_website,
		"annoucements":info.annoucements,
		"githubLink":info.githubLink,
		"explorerLink":info.explorerLink,
		"modifiedDate" : updatedDate()		
	};
	if(uploadImg != null && uploadImg != undefined && uploadImg !="") {
		obj['logo'] = uploadImg;
	}else{
		obj['logo'] = info.logo;
	}
	token.findOneAndUpdate({ "_id": info._id}, { $set: obj},{multi: true}).exec(function(err, resUpdate){
		if(resUpdate) {			
			if(obj.status==1) {
				var arr = obj.market;    
				for (var i=arr.length; i--;) {
					// arr[i] = obj.token_symbol+'/' + arr[i];
					var p = {
						from_symbol:obj.token_symbol,
						to_symbol:arr[i],
						price_range:0,
						trade_fee:0,
						last_price:0,
						min_amt:0,
					};
					var pp= new pairs(p);
					pp.save().then(data=>{ // add pairs db
					});

					var c = {
						name:resUpdate.token_name,
						symbol:resUpdate.token_symbol,
						image:resUpdate.logo,
						type:'erc20'
					};

					var ccy = new currencyDB(c);
					ccy.save().then(data=>{ // add currency db
					});
				}	  
				var wal = {
					currency:resUpdate.token_symbol,
					amount:0
				}
				wallet.update({},{ $push: { wallet:wal}},{multi:true}).exec(function(error,resData) {
				});
			}
			var note = {'user_id':resUpdate.user_id, 'message':'Your '+resUpdate.token_name+' token has been added successfully', 'category':'New Token'}
			notify.create(note, function (err, postRes) { });
			res.json({status : true, msg : "Successfully updated", data : obj});
		} else {
			res.json({status : false, msg : "Invalid request. Please Try again"});
		}
	});	
}

router.get('/getToken', common.tokenMiddleware, (req,res) => {
	token.aggregate([
		{ $lookup: {
			from: "user_info",
			localField: "user_id",
			foreignField: "_id",
			as: "users"
		}},							
		{
			$project : {
				_id : 1,
				"basecoin": "$basecoin",
				"market": "$market",
				"status": "$status",
				"createdDate": "$createdDate",
				"coin_website": "$coin_website",
				"annoucements": "$annoucements",
				"githubLink": "$githubLink",
				"explorerLink": "$explorerLink",
				"user_id": "$user_id",
				"token_name": "$token_name",
				"token_symbol": "$token_symbol",
				"logo": "$logo",
				"contract_address": "$contract_address",
				"decimal": "$decimal",
				"username": {$arrayElemAt:["$users.username",0]},
			}
		},
		{ "$sort": {createdDate: -1} },
		]).exec(function(error,resData){
			if (error) {
				return next(error);
			}
			res.json({status : true, data : resData });		
		})
	});

router.get('/adminDelete/:id', common.originMiddle, (req, res) => {
	var id = req.params.id;
	admin.findOneAndRemove({"_id": id}).exec(function(err,resData){     
		if(resData){
			res.json({status : true, msg : "Successfully deleted"});
		} else {
			res.json({ status : false, msg : "Something went wrong. Please try again" });
		}              
	});    
});


router.get('/adminDashboard', common.tokenMiddleware, (req, res) => {
	async.parallel({
		usersCount:function(cb) {
			users.find({}).countDocuments().exec(cb)
		},activeusers:function(cb) {
			users.find({status:1}).countDocuments().exec(cb)
		},deactiveusers:function(cb) {
			users.find({status:0}).countDocuments().exec(cb)
		},deactives:function(cb) {
			users.find({status:2}).countDocuments().exec(cb)
		},subadminCount:function(cb) {
			users.find({kyc_status:3}).countDocuments().exec(cb)
		},ticketsCount:function(cb) {
			support.find({status :0}).countDocuments().exec(cb)
		},pendingKyc:function(cb) {    
			users.find({kyc_status :1}).countDocuments().exec(cb)
		},rejectKyc:function(cb) {    
			users.find({kyc_status :2}).countDocuments().exec(cb)
		},depositCount:function(cb) {
			deposit.find({}).countDocuments().exec(cb)
		},blockip:function(cb) {
			blockip.find({}).countDocuments().exec(cb)
		},withdrawCount:function(cb) {
			withdraw.find({}).countDocuments().exec(cb)
		},pendingwithdraw:function(cb) {
			withdraw.find({status:"pending"}).countDocuments().exec(cb)
		},tradeCount:function(cb) {
			tempDb.find({}).countDocuments().exec(cb)
		},orderCount:function(cb) {
			tempDb.find({cancel_id:null}).countDocuments().exec(cb)
		},activeorders:function(cb) {
			orderDb.find({status: { $in:['active', 'partially']}}).countDocuments().exec(cb)
		},p2pactiveorders:function(cb) {
			p2porderDb.find({status: { $in:['active', 'partially']}}).countDocuments().exec(cb)
		},p2pdispute:function(cb) {
			p2pdisputeDb.find({}).countDocuments().exec(cb)
		},p2ptemp:function(cb) {
			p2ptempDb.find({cancel_id: null}).countDocuments().exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		response.status    = true;
		response.totalusers = results.usersCount;
		response.activeusers = results.activeusers;
		response.deactiveusers = results.deactiveusers;
		response.deactives = results.deactives;
		response.subadminCount = results.subadminCount;
		response.ticketsCount = results.ticketsCount;
		response.pendingKyc = results.pendingKyc;
		response.rejectKyc = results.rejectKyc;
		response.depositCount = results.depositCount;
		response.blockip = results.blockip;
		response.withdrawCount = results.withdrawCount;
		response.pendingwithdraw = results.pendingwithdraw;
		response.orderCount = results.orderCount;
		response.activeorders = results.activeorders;
		response.tradeCount = results.tradeCount;
		response.p2pactiveorders = results.p2pactiveorders;
		response.p2pdispute = results.p2pdispute;
		response.p2ptemp = results.p2ptemp;
		res.json(response);
	})    
});

//admin & subadmin change pattern
router.post("/changepattern", common.tokenMiddleware, (req, res) => {
	var data=new admin(req.body)  
	admin.updateOne({"_id":req.userId},
		{$set:{"pattern":req.body.newpattern}},function(err,respat){
			admin.findOne({"_id":req.userId}).exec(function(err,adpat){    
				if (err) return res.json(errresponse);
				res.json({success:true, "data":adpat});
			});
		});
});

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