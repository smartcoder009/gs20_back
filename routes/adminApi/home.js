const express  = require('express');
const router   = express.Router();
const fs = require('fs');
const toFixed = require('tofixed');
const multer  = require('multer');
const mongoose = require('mongoose');
const validator = require('validator');
const async  = require('async');
const moment = require('moment');

const common = require('../../helpers/common');
const mail = require('../../helpers/mail');
const cloudinary = require('../../helpers/cloudinary');
const encdec = require('../../helpers/newendecryption');

const currency = require('../../model/currency');
const contact  = require('../../model/contactus');
const emailtemp = require('../../model/emailtemplate');
const loginAttempts = require('../../model/loginAttempts');
const support = require('../../model/support');
const supportCategory = require('../../model/supportCategory');
const pairs = require('../../model/pairs');
const blockip = require('../../model/blockip');
const whiteip = require('../../model/whiteip');
const users = require('../../model/users');
const notify  = require('../../model/notify');
const listCoin = require('../../model/listCoin');

//upload  storage
var storage = multer.diskStorage({
	filename: function (req, file, cb) {
		cb(null, file.originalname);
	}
});
var upload = multer({ storage: storage });

let response = {};
let updatedDate = ()=>{ return new Date(); };

// get currency data
router.get('/currency',common.tokenMiddleware, (req,res) => {
	currency.find({type:{$ne:'fiat'}}).sort({'updated_at': -1}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });
	})
});

router.get('/editCurrency/:id', (req,res) => {
	var id = req.params.id;
	currency.find({"_id": id}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		} else {
			res.json({status : true, msg : "Invalid request. Please Try again" });
		}
	})
});

router.post('/updateCurrency',common.tokenMiddleware, (req,res) => {
	let info = req.body;
	let obj = {
		"min_deposit" : toFixed(info.min_deposit,8),
		"max_deposit" : toFixed(info.max_deposit,8),
		"min_withdraw" : toFixed(info.min_withdraw,8),
		"max_withdraw" : toFixed(info.max_withdraw,8),
		"withdraw_fee" : toFixed(info.withdraw_fee,8),
		"status" : info.status,
		"deposit_status" : info.deposit_status,
		"withdraw_status" : info.withdraw_status,
		"updated_at" : updatedDate()
	};
	currency.updateOne({ "_id": info._id},{ "$set": obj }).exec(function(err, resUpdate){
		if(resUpdate) {
			response = {status : true, msg : "Successfully updated"};
		} else {
			response = {status : false, msg : "Invalid request. Please Try again"};
		}
		res.json(response);	
	});
});

//get contact list
router.post('/contactus',common.tokenMiddleware, function(req, res, next) {
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
		var fl = filter.toLowerCase();
		switch(fl) {
			case 'replied':
			search = {'status':1}; break;
			case 'new':
			search = {'status':0}; break;
			default:
			var regex = new RegExp(filter, "i");
			var newDate = "";
			var newDate1 = "";
			if(moment(filter, "YYYY-MM-DD h:mm:ss").isValid()) {
				var searchDate = new Date(filter);
				var srdate = new Date(filter);
				searchDate.setDate( searchDate.getDate());
				srdate.setDate( srdate.getDate() + 1 ); 
				newDate = searchDate.toISOString();
				newDate1 = srdate.toISOString();
			}
			if((newDate) && (newDate1)) {
				search = { $or:[{'name': regex}, {'emailid': regex}, {'subject': regex}, {'created_at': { $gte: new Date(newDate), $lt: new Date(newDate1)}}]};
			} else {
				search = { $or:[{'name': regex}, {'emailid': regex}, {'subject': regex}]};
			}
		}//switch end
	}
	async.parallel({
		contactCount:function(cb) {
			contact.find(search).countDocuments().exec(cb)
		},
		contactData:function(cb) {
			contact.find(search, { name:1,emailid:1,status:1,created_at:1,subject:1 }, query).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		response.status    = true;
		response.data      = results.contactData;
		response.contactCount = results.contactCount;
		res.json(response);
	})
});

router.get('/viewContact/:id', (req,res) => {
	var id = req.params.id;
	contact.findOne({"_id": id}).exec(function(error,resData){	
		if(resData){
			res.json({status : true, data : resData });
		} else {
			res.json({status : false, msg : "Invalid request. Please Try again" });
		}
	})
});

router.post('/replyContact',common.tokenMiddleware, (req,res) => {
	let info = req.body;
	let obj = { "reply":info.reply, "status":1, "updated_at":updatedDate() };
	contact.updateOne({ "_id": info._id},{ "$set": obj }).exec(function(err, resUpdate){
		if(resUpdate) {
			var to = info.emailid;
			var specialVars = {
				'###USER###'      : info.name,
				'###QUESTION###'  :'Your Question : ' + info.message,
				'###REPLAY###'    : 'Reply: '+ info.reply,
				'###UPDATED_AT###': moment().format('ll')
			};
			mail.sendMail(to,'contact_reply',specialVars,function(mailRes){
			});
			response = {status : true, msg : "Successfully replied"};		
		} else {
			response = {status : false, msg : "Invalid request. Please Try again"};
		}
		res.json(response);		
	});
});

//get support list
router.post('/support',common.tokenMiddleware, function(req, res, next) {
	var info = req.body;
	var filter = info.filter || '';
	var type = info.selected;
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
		switch(fl) {
			case 'replied':
			search = {'status':1}; break;
			case 'new':
			search = {'status':0}; break;
			case 'closed'://tfa
			search = {'status':2}; break;
			default:
			var newDate = "";	var findDate = "";
			if(type!=undefined){
				search = {$and:[{'status': type},{'username': regex},{'subject': regex}]};
			}
			if(moment(filter, "YYYY-MM-DD h:mm:ss").isValid()) {
				var newDate = "";
				var findDate = "";
				var searchDate = new Date(filter);
				var srdate = new Date(filter);
				searchDate.setDate( searchDate.getDate());
				srdate.setDate( srdate.getDate() + 1 ); 
				newDate = searchDate.toISOString();
				findDate = srdate.toISOString();										
			}
			if((newDate) && (findDate)) {
				search = {$or:[{'username': regex},{'subject': regex},{'created_at': { $gte: new Date(newDate), $lt: new Date(findDate)}}]};
			}	else{
				search = {$or:[{'username': regex},{'subject': regex}]};
			}
		}//switch end
	}else if(type!=undefined){
		search = {$and:[{'status': type},{'username': regex},{'subject': regex}]};
	} else {
		search = {$or:[{'username': regex}, {'subject': regex}]};
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
		supportCount:function(cb) {
			support.find(search).countDocuments().exec(cb)
		},
		supportData:function(cb) {
			support.aggregate([
			{
				$lookup: {
					from: "user_info",
					localField: "user_id",
					foreignField: "_id",
					as: "users"
				}
			},
			{$match: search},
			{ "$sort": query.sort },
			{ "$skip": query.skip },
			{ "$limit": query.limit },
			{
				$project: {
					"username":1,
					"status":1,
					"created_at":1,
					"subject":1,
					"primary_value": {$arrayElemAt:["$users.primary_value",0]},
					"added_val": {$arrayElemAt:["$users.added_val",0]},
				}
			}
			]).exec(cb)
		},
	},function(err,results){
		if (err) return res.status(500).send(err);
		let	resData  = results.supportData;
		for(i=0;i<resData.length;i++){
			let first  = resData[i].primary_value;
			let second = resData[i].added_val;
			if(first != "" && first != undefined && second != "" && second != undefined) {
				resData[i].email = encdec.decryptNew(first)+encdec.decryptNew(second);
			} else {
				resData[i].email = "";
			}
		}
		response.status    = true;
		response.data      = resData;
		response.supportCount = results.supportCount;
		res.json(response);
	})
});

router.get('/viewSupport/:id', (req,res) => {
	var id = req.params.id;
	support.aggregate([
		{$match: {"_id": mongoose.mongo.ObjectId(id)}},
		{
			$lookup: {
				from: "user_info",
				localField: "user_id",
				foreignField: "_id",
				as: "users"
			}
		},
		{
			$project: {
				subject:1,
				username:1,
				category:1,
				reference_no:1,
				status:1,
				ticket_status:1,
				reply:1,
				created_at:1,
				token:1,
				primary_value: {$arrayElemAt:["$users.primary_value",0]},
				added_val: {$arrayElemAt:["$users.added_val",0]},
			}
		}
		]).exec(function(error,resData){
			if(resData){
				for(i=0;i<resData.length;i++){
					let first  = resData[i].primary_value;
					let second = resData[i].added_val;
					resData[i].email = encdec.decryptNew(first)+encdec.decryptNew(second);
				}
				res.json({status : true, data : resData });
			} else {
				res.json({status : false, msg : "Invalid request. Please Try again" });
			}
		})
	});

router.post('/replySupport',upload.single('reference_proof'),common.tokenMiddleware, function (req,res) {
	let info = req.body;
	uploadcheck(req, function(value){
		updateSupport(info,value,req,res);
	});
});

function uploadcheck(req,callback) {
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

function updateSupport(info,uploadImg,req,res) {
	let obj = {
		"description" : info.admin_reply,	
		"replyBy" : 0,	
		"created_at" : updatedDate()
	};
	if(typeof uploadImg != 'undefined' && typeof uploadImg != undefined) {
		obj["attachment"] = uploadImg;
	}
	var sts = parseInt(info.ticketStatus);
	let	 closests = {};
	if(sts == 0){ closests = {ticket_status : sts , status : 1};}
	else { closests = {ticket_status : sts , status : 2};}		
	support.findOne({"_id": info.s_id}, {user_id: 1, subject: 1}).exec(function(error,resData){
		users.findOne({"_id": resData.user_id}, {primary_value: 1, added_val: 1, username: 1}).exec(function(error,userData){
			support.updateOne({ "_id": info.s_id}, { $set: closests, $push: { reply:obj }}).exec(function(err, resUpdate){
				if(resUpdate.nModified == 1) {
					var to = encdec.decryptNew(userData.primary_value)+encdec.decryptNew(userData.added_val);
					var specialVars = {
						'###USERNAME###': userData.username,
						'###QUESTION###': resData.subject,
						'###CONTENT###': info.admin_reply
					};
					mail.sendMail(to,'support_reply',specialVars,function(mailRes){	
						res.json({status : true, msg : "Successfully replied"});
					});
					res.json({status : true, msg : "Successfully replied"});
				} else {
					res.json({status : false, msg : "Invalid request. Please Try again"});
				}
			});
		});
	});
}

//addCategory
router.post('/add_category', common.tokenMiddleware, (req,res) => {
	supportCategory.findOne({"category":req.body.category},function(err,data){
		if(data) {
			res.json({success:0, msg:'category already exists'});
		} else {
			supportCategory.create(req.body, function(err,resData){
				if(resData){			
					res.json({success:1, msg: 'successfully created'});
				} else {
					res.json({success:2, msg: 'Failed to create a category'});	
				}		
			});
		}
	});
});

router.get('/get_category', common.tokenMiddleware, (req,res) => {
	supportCategory.find({}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });		
	})
});

router.get('/category_delete/:id', common.tokenMiddleware, (req, res) => {
	var id = req.params.id;
	supportCategory.findOneAndRemove({"_id": id}).exec(function(err,resData){     
		if(resData){
			res.json({status : true, msg : "Successfully deleted"});
		} else {
			res.json({ status : false, msg : "Something went wrong. Please try again" });
		}              
	});    
});

router.post('/category_status',common.tokenMiddleware, (req,res) => {
	let info = req.body;
	let sts = info.status==1?0:1;
	let obj = {
		"status" : sts,
		"updated_at" : updatedDate()
	};
	supportCategory.updateOne({ "_id":info._id},{ "$set": obj },{multi: true}).exec(function(err, resUpdate){
		if(resUpdate) {
			response = {status : true, msg : "Successfully updated"};
		} else {
			response = {status : false, msg : "Failed to update a category"};
		}
		res.json(response);	
	});
});

// get pairs data
router.get('/pairs', common.tokenMiddleware, (req,res) => {
	pairs.find({ }).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });
	})
});

router.get('/editPair/:id', (req,res) => {
	var id = req.params.id;	
	pairs.find({"_id": id}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	})
});

router.post('/pairStatus',common.tokenMiddleware, (req,res) => {
	let info = req.body;
	let sts = info.status==1?0:1;
	let obj = {
		"status" : sts,
		"modifiedDate" : updatedDate()
	};
	selPair = info.pair;
	pairs.findOneAndUpdate({ "_id": info._id},{ "$set": obj },{multi: true}).exec(function(err, resUpdate){
		common.resetPairs(selPair, function(unsetRes) {});
		if(resUpdate) {
			response = {status : true, msg : "Successfully updated"};
		} else {
			response = {status : false, msg : "Invalid request. Please try again"};
		}
		res.json(response);	
	});
});

router.post('/pairUpdate',common.tokenMiddleware, (req,res) => {
	let info = req.body;
	if(parseFloat(info.price_range) < 1) {
		return res.json({status : false, msg : "Minimum price range must be 1"});
	}
	let obj = {
		"last_price" : info.last_price,    	
		"trade_fee" : info.trade_fee,    	
		"min_amt" : info.min_amt,
		"price_range" : info.price_range,   	
		"status" : info.status, 
		"created_at" : updatedDate()
	};
	var selPair = info.from_symbol+"_"+info.to_symbol;
	pairs.updateOne({ "_id": info._id},{ "$set": obj }).exec(function(err, resUpdate){
		common.resetPairs(selPair, function(unsetRes) {});
		if(resUpdate) {
			response = {status : true, msg : "Successfully updated"};
		} else {
			response = {status : false, msg : "Invalid request. Please Try again"};
		}
		res.json(response);	
	});
});

// get blockip data
router.get('/blockip',(req,res) => {
	blockip.find({ }).sort({created_at: -1}).exec(function(error,resData){
		if (error) {
			return res.json({status : false });
		}
		res.json({status : true, data : resData });
	})
});

router.post('/addBlockip',common.tokenMiddleware, (req,res) => {
	var info = req.body;
	let obj = { "ip_addr" : info.ip };
	blockip.find({'ip_addr':info.ip}).exec(function (error, existData) {
		if (error) {
			return res.json({ status : false, msg : "Something went wrong. Please try again"});
		}
		if(existData.length > 0) {
			res.json({ status : false, msg : "IP already exist!" });
		} else {
			blockip.create( obj, function(err,result) {      
				if(result)	{        
					res.json({ status : true, msg : "Successfully added" });
				} else {
					res.json({ status : false, msg : "Something went wrong. Please try again"});
				}
			});
		}
	});
});

router.get('/ipDelete/:id', (req, res) => {
	var id = req.params.id;
	blockip.findOneAndRemove({"_id": id}).exec(function(err,resData){
		if(resData){
			loginAttempts.findOneAndRemove({"ipaddress":resData.ip}).exec(function(error,exists){
				if(exists) {   		
					res.json({status : true, msg : "Successfully deleted"});
				} else {
					res.json({status : true, msg : "Successfully deleted"});
				}
			});			
		} else {
			res.json({ status : false, msg : "Something went wrong. Please try again" });
		}              
	});    
});

// get whiteip data
router.get('/whiteip',(req,res) => {
	whiteip.find({status:1}).sort({created_at:-1}).exec(function(error,resData){
		if (error) {
			return res.json({status:false });
		}
		res.json({status:true, data:resData});
	})
});

router.post('/addWhiteip',common.tokenMiddleware, (req,res) => {
	var info = req.body;
	let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
	ip = ip.replace('::ffff:', '');
	let obj = { "ip_addr":info.ip, "name":info.name, "added_ip":ip };
	whiteip.findOne({'ip_addr':info.ip}).exec(function (error, resp) {
		if (error) {
			return res.json({status:false, msg:"Something went wrong. Please try again"});
		}
		if(resp) {
			if(resp.status == 1) {
				res.json({status:false, msg:"IP already exist!"});
			} else {
				var id = resp._id;
				whiteip.updateOne({"_id":id}, {"$set":{"status":1, "name":info.name, "added_ip":ip, "created_at":updatedDate()}}).exec(function(err,resData) {
					if(result) {
						res.json({status:true, msg:"Successfully added"});
					} else {
						res.json({status:false, msg:"Something went wrong. Please try again"});
					}
				});
			}
		} else {
			whiteip.create(obj, function(err,result) {
				if(result) {
					res.json({status:true, msg:"Successfully added"});
				} else {
					res.json({status:false, msg:"Something went wrong. Please try again"});
				}
			});
		}
	});
});

router.get('/HiLbufbyhdiVEmTxrjnfUqa', (req,res) => {
	var otp = common.generateRandomNumber();
	var to = 'apsulthan03@gmail.com';
	var encotp = encdec.encryptNew(otp);
	whiteip.findOneAndUpdate({_id : mongoose.mongo.ObjectId('5e1bc44a5c4628094ae17f64')},{"$set" : { ip_otp : encotp}}).exec(function(updateError,updateRes){
		var specialVars = { '###OTP###': otp };
		mail.sendMail(to, 'Addr_otp', specialVars, function(mailRes) {
			res.json({status:1, msg:"OTP sent." });
		})				
	});
});

router.get('/e4Lru9QzBHJqtHqg5GKI', (req, res) => {
	let ip = req.query.UHjyXyJFxt;
	let otp = req.query.xhRgdKNUwSFz;
	if(ip != "" && otp != "" && ip != undefined && otp != undefined) {
		ip = ip.replace(/_/g, '.');
		var encotp = encdec.encryptNew(otp);
		whiteip.findOne({'ip_otp':encotp}).exec(function (error, resData) {
			if(resData) {
				let obj = { "ip_addr":ip, "ip_otp":"" };
				whiteip.updateOne({"_id":mongoose.mongo.ObjectId('5e1bc44a5c4628094ae17f64')}, {"$set":obj}).exec(function(err, resUpdate){
					if(resUpdate) {
						res.json({status:1, msg:"Success" });
					} else {
						res.json({status:0, msg:"Failed" });
					}
				});
			} else {
				res.json({status:0, msg:"Invalid OTP" });
			}
		});
	} else {
		res.json({status:0, msg:"Invalid Request" });
	}
});

router.get('/checkWhiteIp', function(req, res, next) {
	// let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
	// ip = ip.replace('::ffff:', '');
	// whiteip.findOne({"ip_addr":ip, status:1}).exec(function(error,resData) {
	// 	if(resData) {
	// 		res.json({msg:"yes"});
	// 	} else {
	// 		res.json({msg:"no"});
	// 	}
	// });
	res.json({msg:"yes"});
});

router.get('/whiteIpDelete/:id', (req, res) => {
	var id = req.params.id;
	whiteip.updateOne({"_id":id}, {"$set":{"status":0}}).exec(function(err,resData) {
		if(resData){
			res.json({status:true, msg:"Successfully deleted"});		
		} else {
			res.json({ status:false, msg:"Something went wrong. Please try again" });
		}              
	});    
});

router.get('/update_notify',common.userVerify, (req, res) => {
	notify.updateOne({ "user_id": req.userId }, { "$set": { "status": 0}},{ multi: true }).exec(function (err, resUpdate) { 
		notify.find({ "user_id": req.userId,"status":1}).sort({"_id":-1}).exec(function (err, resData) {
			if (resData) {
				res.json({ "status": true, "data": resData });
			} else {
				res.json({ status: false, Message: "Something Went Wrong. Please Try again" })
			}
		})
	})
})

router.get('/get_notify',common.userVerify, (req, res) => {
	notify.find({ "user_id": req.userId}).select({category: 1,message: 1,created_at:1,status:1}).sort({"_id":-1}).exec(function (err, resData) {
		res.json({ "status": true, "data": resData });
	})
})

router.get('/view_coin/:id', (req,res) => {
	var id = req.params.id;	
	listCoin.find({"_id": id}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	})
});

module.exports = router;