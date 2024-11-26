const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const async  = require('async');

const multer  = require('multer');
const validator  = require('validator');
const common = require('../../helpers/common');
const encdec = require('../../helpers/newendecryption');
const mail     = require('../../helpers/mail');

//schemas load
const admin   = require('../../model/admin');
const contactus = require('../../model/contactus');
const support = require('../../model/support');
const users = require('../../model/users');
const supportCategory = require('../../model/supportCategory');
const notify  = require('../../model/notify');

//upload  storage
var storage = multer.diskStorage({
	filename: function (req, file, cb) {
		cb(null, file.originalname);
	}
});

var upload = multer({ storage: storage });

let response = {};
let updatedDate = ()=>{ return new Date(); };

// contact post data
router.post('/contact', (req,res) => {
	try {
		let info  = req.body;
		let email = validator.isEmail(info.email);
		if(email) {
			let obj = { name: info.name, emailid: info.email, subject: info.subject, message: info.message }
			contactus.create(obj, function(err,resData){
				if(resData) {
					res.json({success: 1, msg: 'Thank you for contacting our support. We will reply to your question as soon as possible.'});
				} else {
					res.json({success: 2, msg: "Please Try Again"})
				}
			})
		} else {
			res.json({success: 0, msg:"Please enter valid details"})
		}

	} catch (e) {
		res.json({success : 0, msg : "Please enter valid details"})
	}
});

router.post('/raiseTicket',upload.single('reference_proof'), common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	users.findOne({"_id":userId},{_id:0}).select("username").exec(function(error,userRes){
		let userName = userRes.username;
	  common.singleUploadcheck(req, function(uploadImg) {
			let ticketId = "ST"+common.generateRandomNumber();
			let obj = {	"description" : info.message, "replyBy" : 1 , "created_at" : updatedDate()};

			let newtick ={
				"user_id"     : userId,
				"username"    : userName,
				"reference_no": ticketId,
				"category"    : info.category,
				"subject"     : info.subject		
			}
			if(typeof uploadImg != 'undefined' && typeof uploadImg != undefined && uploadImg != "") {
				obj["attachment"] = uploadImg;
			}
			support.create( newtick, function(err, resUpdate){
				if(resUpdate) {
						support.updateOne({reference_no: newtick.reference_no}, { $push: { reply:obj}}).exec(function(err,resData) {			
					if(resData) {
						var specialVars = {
							'###USER###': 'Admin',
							'###USERNAME###': userName,
							'###CATEGORY###': info.category,
							'###SUBJECT###': info.subject,
							'###MESSAGE###': info.message
						};
						// mail.sendMail("support", 'support_mail', specialVars, function(mailRes) {});
						res.json({success : 1, msg : " Support ticket added successfully"});
					} else {
						res.json({success : 0, msg : "Somethinge went wrong. Please try again"});
					}						
				});
			}else{
					  res.json({success : 2, msg : "Somethinge went wrong. Please try again"});
					}
				});
			});
		});
	});

router.get('/user_support',common.userVerify, (req,res) => {
	try {
		let userId  = req.userId;
		let validUser = validator.isMongoId(userId);
		if(validUser){
			async.parallel({
				categoryList:function(cb) {
					supportCategory.find({ status: 1 },{_id:0}).select("category").exec(cb)
				},
				supportData:function(cb) {
					support.find({"user_id": userId},{_id:0,updated_at:0,user_id:0}).sort({"created_at":-1}).exec(cb)
				},
			},function(err,results){
				if (err) { return res.json({success:0, msg:"Please try again later"}); }		
				for(i=0;i<results.supportData.length;i++){
				  let refNo = results.supportData[i].reference_no;
					var ept = encdec.encryptNew(refNo);
					var uri = encodeURIComponent(ept);
					results.supportData[i].token = uri;			
				}
				let supportinfo = { cate:results.categoryList, supportlist:results.supportData };
				res.json({success:1, supportinfo:supportinfo})
			})
		} else {
			res.json({success:401, msg:"Unauthorized"});
		}
	} catch (e) {
		  res.json({success:401, msg:"Unauthorized"});
	}
});

router.post('/viewTicket', common.userVerify, (req,res) => {
	try {
		var info = req.body;
  	var id = info.token;
  	let idVal = validator.isEmpty(id);
  	if(idVal) {
			return res.json({success:0, msg:"Invalid Request"});
		}
		var refNo = encdec.decryptNew(decodeURIComponent(id));
		let userId  = req.userId;
		let validUser = validator.isMongoId(userId);
		if(validUser){
			async.parallel({
				Support:function(cb) {
					support.findOne({"reference_no": refNo},{_id:0,user_id:0,updated_at:0}).exec(cb)
				},
				User:function(cb) {
					users.findOne({"_id": userId},{_id:0}).select("profile_pic").exec(cb)
				},
				Admin:function(cb) {
			    admin.findOne({"role": 1},{_id:0}).select("profileimg").exec(cb)
				},
			},function(err,results){
				if (err) { return res.json({success:0, msg:"Please try again later"}); }		
			  var user_info = {}; 
				let user = { profile:results.User, ticket:results.Support, propic:results.Admin};
				res.json({success:1, user_info:user})
			})
		} else {
			res.json({success:401, msg:"Unauthorized"});
		}
	} catch (e) {
	  res.json({success:401, msg:"Unauthorized"});
	}
});

router.post('/replyTicket', upload.single('reference_proof'), common.userVerify, (req,res) => {
	let info = req.body;
	let userId = req.userId;
	let validUser = validator.isMongoId(userId);
	if(validUser) {
		support.findOne({"reference_no":info.reference_no, ticket_status:1}).exec(function(err, resUpdate) {
			if(resUpdate) {
				response = {success:0 , msg:"This ticket was already closed by an admin"};
				res.json(response);	
			} else {
				common.singleUploadcheck(req, function(uploadImg) {
					let obj = { "replyBy":1, "description":info.message, "created_at":updatedDate() };
					// let closetick ={ "ticket_status":info.ticket_status }
					var sts = info.ticket_status;
					let	 closetick = {};
					if(sts == 0){closetick = {ticket_status:sts, status:0};} else {closetick = {ticket_status:sts , status:2};}
					if(typeof uploadImg != 'undefined' && typeof uploadImg != undefined && uploadImg != "") {
						obj["attachment"] = uploadImg;
					}
					support.updateOne({reference_no: info.reference_no}, {  $set: closetick, $push: { reply:obj}}).exec(function(err,resUpdate) {
						if(resUpdate) {
							response = {success : 1, msg : "Successfully replied"};
						} else {
							response = {success : 2, msg : "Somethinge went wrong. Please try again"};
						}
						res.json(response);
					});
				});
			}
		})
	} else {
		res.json({success : 401, msg : "Unauthorized" });
	}
});

router.get('/getNotify', common.userVerify, (req, res) => {
 	notify.find({user_id:req.userId, status:1}).countDocuments().exec(function (err, resData) {
    res.json({"success":1, "result":resData });
  })
})

module.exports = router;