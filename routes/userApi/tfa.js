const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
let moment = require('moment');

let common = require('../../helpers/common');
var encdec = require('../../helpers/newendecryption');
var validator  = require('validator');
var mail     = require('../../helpers/mail');
var userhis = require('../../model/userhistory');
let users   = require('../../model/users');
let notify  = require('../../model/notify');
const ipInfo = require("ipinfo");
const useragent = require('useragent');

let updatedDate = () => { return new Date(); };

router.post('/updateTfa', common.userVerify,(req, res) => {
	try {
		let info = req.body;
		let status; let usermail;
		users.findOne({"_id": req.userId},{_id:0}).exec(function(err,userRes){
			var verified = speakeasy.totp.verify({
				secret  : encdec.withDecrypt(userRes.tfa_code),
				encoding: 'base32',
				token   : info.tfa_code
			});
			usermail = encdec.decryptNew(userRes.primary_value)+encdec.decryptNew(userRes.added_val);
			let userValidation = validator.isMongoId(req.userId);		
			if(verified && userValidation) {
				if(userRes.tfa_status == 0){
					var updateVal = { tfa_status:1, tfa_update:updatedDate() };
          var updatedRule = { tfa_status:1 };
					status = 'enabled';
				} else {
					var qrName = `GS20Exchange (${usermail})`;
					var secret = speakeasy.generateSecret({length:10, name:qrName});
          var tfaCode = secret.base32;
          var tfaUrl = secret.otpauth_url;
          var url = tfaUrl.replace(tfaCode, "");
          var updateVal = { tfa_status:0, tfa_code:encdec.withEncrypt(tfaCode), tfa_url:url, tfa_update:updatedDate() };
					var updatedRule = { tfa_status:0, tfa_code:tfaCode, tfa_url:encdec.getQrUrl(tfaUrl)};
					status = 'disabled';
				}
				users.updateOne({"_id":req.userId}, {"$set":updateVal}).exec(function(err, upRes) {
					if(err) {
            return res.json({ status:false, msg:"Please try again" });
					}
          //if(userRes.notify_tfa == 1){
					// var specialVars = {
					//  '###USER###'      : userRes.username,
					//  '###STATUS###'		 : status,							               	
					//  '###UPDATED_AT###': moment().format('ll')
					// };
					// mail.sendMail(usermail,'notify_tfa',specialVars,function(mailRes) { });
					// var note = {'user_id':req.userId, 'message':'TFA has been '+status+ ' for your account','category':'Tfa Alert'}
					// notify.create(note, function (err, postRes) { });
					// res.json({ status : true,	result : updatedRule });
		  	  // }
  			  res.json({ status:true, result:updatedRule });
				});
			} else {
				res.json({ status:false, msg:"Invalid 2FA Code" });
			}
		});
	} catch(e) {
		res.status(401).send('unauthorized')
	}
});

router.post('/updateLoginTfa', (req, res) => {
  try {
    var info = req.body;
    let userId = encdec.withDecrypt(decodeURIComponent(info.ttoken));
    users.findOne({_id:userId}, {_id:1, tfa_code:1}).exec(function(err, resData) {
      if(resData) {
        var verified = speakeasy.totp.verify({
          secret  : encdec.withDecrypt(resData.tfa_code),
          encoding: 'base32',
          token   : info.tfa_code,
          window  : 1
        });
        if(verified == true) {
          var updateVal = { tfa_status:1, tfa_update:updatedDate() };
          users.updateOne({_id:userId}, {"$set":updateVal}).exec(function(err, upRes) {
            if(upRes) {
              let authKey = common.createPayload(userId);
              var encUserId = encdec.encryptNew(userId.toString());
              res.json({success:1, token:authKey, key:encodeURIComponent(encUserId)});
            } else {
              res.json({success:0, msg:"Failed to update"});
            }
          });
        } else {
          res.json({success:0, msg:"Invalid TFA code"});
        }
      }
    });
  } catch(e) {
    res.json({success:0, msg:"Something went wrong"});
  }
});

router.post('/enableTfa', (req, res) => {
  try {
    var info = req.body;
    let userId = encdec.withDecrypt(decodeURIComponent(info.token));
    users.findOne({"_id":userId}, {_id:0, tfa_status:1, tfa_code:1, tfa_url:1, primary_value:1, added_val:1}).exec(function(err, userRes) {
      if(userRes) {
        upTfaCode(userId, userRes, function(resp) {
          if(resp) {
            let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
            ip = ip.replace('::ffff:', '');
            var agent = useragent.parse(req.headers['user-agent']);
            var os = agent.os.toString().split(' ')[0];
            var browser = agent.toAgent().split(' ')[0];
            let obj = { user_id:userId, ip_address:ip, browser:browser, image:"", deviceinfo:os };
            userhis.create(obj, function(err,result) { });
            res.json({success:1, result:resp});
          } else {
            res.json({success:0, msg:"Failed to create TFA"});
          }
        })
      } else {
        res.json({success:0, msg:"Invalid User"});
      }
    });
  } catch(e) {
    res.json({success:0, msg:"Something went wrong"});
  }
});

function upTfaCode(userId, parData, cb) {
  if(parData.tfa_code == "") {
    var usermail = encdec.decryptNew(parData.primary_value)+encdec.decryptNew(parData.added_val);
    var qrName = `GS20Exchange (${usermail})`;
    var secret = speakeasy.generateSecret({length:10, name:qrName});
    var tfaCode = secret.base32;
    var tfaUrl = secret.otpauth_url;
    var url = tfaUrl.replace(tfaCode, "");
    updateVal = { tfa_code:encdec.withEncrypt(tfaCode), tfa_url:url, tfa_update:updatedDate() };
    users.updateOne({ "_id": userId},{ "$set": updateVal }).exec(function(err, resUpdate){
      if(resUpdate) {
        cb({tfa_code:tfaCode, tfa_url:encdec.getQrUrl(tfaUrl)});
      } else {
        cb(false);
      }
    });
  } else {
    var tfaCode = encdec.withDecrypt(parData.tfa_code);
    var tfaUrl = parData.tfa_url+tfaCode;
    cb({tfa_code:tfaCode, tfa_url:encdec.getQrUrl(tfaUrl)});
  }
}

// TFA Check
router.post('/tfaLogin', (req, res) => {
  try{
	  var info = req.body;
	 	var userId = encdec.decryptNew(decodeURIComponent(info.ttoken));
    users.findOne({"_id":userId}, {tfa_code:1}).exec(function(err,resData){
      if(resData) {
        var verified = speakeasy.totp.verify({
          secret  : encdec.withDecrypt(resData.tfa_code),
          encoding: 'base32',
          token   : info.tfa_code,
          window  : 1
        });
        if(verified == true){
        	let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
  				ip = ip.replace('::ffff:', '');
  				var agent = useragent.parse(req.headers['user-agent']);
  				var os = agent.os.toString().split(' ')[0];
  				var browser = agent.toAgent().split(' ')[0];
  				let obj = { user_id:userId, ip_address:ip, browser:browser, image:"", deviceinfo:os };
  				userhis.create(obj, function(err,result) {
  					if(result) {
  						let authKey = common.createPayload(userId);
  						return res.json({success:1, token:authKey });
  					} else {
  						res.json({success:0, msg:"Failed to login"});
  					}
  				});
        } else {
          res.json({success: 2, msg : "Invalid 2FA Code"});
        }
      } else {
        res.json({success: 2, msg : "Invalid 2FA Code"});
      }
    });
  } catch(e) {
    console.log("loginverifytfq",e);
  }   
});

//Email OTP check
router.post('/emailLogin', (req, res) => {
  try{
	  var info = req.body;
	 	var userId = encdec.decryptNew(decodeURIComponent(info.ttoken));
	 	var email_otp = info.tfa_code;
	 	let emailVal = validator.isEmpty(email_otp);
		let emailNum = validator.isNumeric(email_otp);
		if(emailVal || !emailNum) {
			return res.json({success:0, msg:"Please enter login OTP"});
		}
		var ENC_OTP = encdec.withEncrypt(email_otp);
    users.findOne({"_id":userId, "email_otp":ENC_OTP}, {_id:1}).exec(function(err,resData){  
      if(resData) {
      	let ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
				ip = ip.replace('::ffff:', '');
				var agent = useragent.parse(req.headers['user-agent']);
				var os = agent.os.toString().split(' ')[0];
				var browser = agent.toAgent().split(' ')[0];
				let obj = { user_id:userId, ip_address:ip, browser:browser, image:"",deviceinfo:os };
				userhis.create(obj, function(err,result) {
					if(result) {
						upEmailRule = { 'email_otp': 0};
						users.updateOne({"_id":userId}, {"$set":upEmailRule}).exec(function(err, resUpdate) { });
						let authKey = encdec.withEncrypt(userId.toString());
						return res.json({success:1, user_token:authKey});
					} else {
						res.json({success:0, msg:"Failed to login"});
					}
				});       
      } else {
        res.json({success:2, msg:"Invalid Email OTP"});
      }
    });
  } catch(e) {
    console.log("loginEmailOTP",e);
  }   
});

router.post('/withdrawverifytfq',common.userVerify, (req, res) => {
  try {
  	var info = req.body;
    let userId = req.userId;
    users.findOne({"_id":userId}, {tfa_code:1}).exec(function(err,resData){    
      var verified = speakeasy.totp.verify({
        secret  : encdec.withDecrypt(resData.tfa_code),
        encoding: 'base32',
        token   : info.code,
        window  : 1
      });
      if(verified == true){
        res.json({"status": true,"resData":verified});
      } else {
        res.json({"status": false,"msg": "Invalid 2FA Code"});
      }
    });
  } catch(e) {
    res.json({"status": false,"resData": e});
  }
});

router.post('/resetWithPass',common.userVerify, (req, res) => {
  try {
    var info = req.body;
    let userId = req.userId;
    users.findOne({"_id":userId}, {tfa_code:1}).exec(function(err,resData) {    
      var verified = speakeasy.totp.verify({
        secret  : encdec.withDecrypt(resData.tfa_code),
        encoding: 'base32',
        token   : info.code,
        window  : 1
      });
      if(verified == true) {
        users.updateOne({_id:userId}, {"$set":{with_pass:""}}).exec(function(err, upRes) {
          if(upRes) {
            res.json({"status":true});
          } else {
            res.json({"status":false, msg:"Failed to reset withdraw password"});
          }
        });
      } else {
        res.json({"status":false, "msg":"Invalid 2FA Code"});
      }
    });
  } catch(e) {
    res.json({"status":false, "msg": "Something went wrong"});
  }
});

module.exports = router;