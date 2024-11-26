const CryptoJS = require("crypto-js");
const Cryptr = require('cryptr');
const cryptr = new Cryptr('IfPaptnkapHdanualQfDkw');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const crypto = require("crypto");
const Util = require('util');

let key = "6DPz{U9X:xAat<w4v<Z@/!";
let iv  = "GMWAsgGxuKSbrVbpKHLXg";
key = CryptoJS.enc.Base64.parse(key);
iv = CryptoJS.enc.Base64.parse(iv);

let withKey = "[zgFmZ)6>8V!2m@RDu&R2m";
let withIv  = "UJGERmahLVbugHbxtXrDL";
withKey = CryptoJS.enc.Base64.parse(withKey);
withIv  = CryptoJS.enc.Base64.parse(withIv);

module.exports = {
	hashPswd : function(pass, cb) {
		bcrypt.hash(pass, saltRounds, function(err, hash) {
			cb(hash);
		});
	},
	comparePswd : function(pass, dbPass, cb) {
		bcrypt.compare(pass, dbPass, function(err, res) {
			cb(res);
		});
	},
	cmpreMultiPwd : function(pass, passArr, cb) {
		var i = 1;
		var len = passArr.length;
		if(len > 0) {
			passArr.forEach((val) => {
	      bcrypt.compare(pass, val, function(err, res) {
	        if(res) {
	        	cb(1); return;
	        } else {
	        	if(i == len) { cb(0); }
	        }
	        i = i + 1;
	      })
	    });
		} else {
			cb(0);
		}
	},
	encryptNew : function(txt){
		return CryptoJS.AES.encrypt(txt, key,{iv:iv}).toString();
	},
	encrypt_with : function(txt){
		return cryptr.encrypt(txt)
	},
	decrypt_with : function(txt){
		return cryptr.decrypt(txt)
	},
	decryptNew : function(txt){
		var bytes  = CryptoJS.AES.decrypt(txt.toString(), key, {iv:iv});
		return bytes.toString(CryptoJS.enc.Utf8);
	},
	withEncrypt : function(txt){
		return CryptoJS.AES.encrypt(txt, withKey,{iv:withIv}).toString();
	},
	withDecrypt : function(txt){
		var bytes  = CryptoJS.AES.decrypt(txt.toString(), withKey, {iv:withIv});
		return bytes.toString(CryptoJS.enc.Utf8);
	},
	siteUrl: function(req) {
		return "https://gs20.exchange/";
	},
	userUrl: function(req) {
		return "https://gs20.exchange/";
	},
	adminNewUrl: function() {
		return "https://oeyfnvpdjh.gs20.exchange/#/pages/";
	},
	frontUrl: function() {
		return "https://gs20.exchange/";
	},
	wltNewUrl: function(req) {
		return "https://kspedfhabc.gs20.exchange/#/GsWalLEt/";
	},
	firstNewMail: function(email) {
		return email.substr(0, 5);
	},
	secondNewMail: function(email) {
		return email.substr(5);
	},
	encryptNewEmail : function(txt){
		let email = txt.substr(0, 5)
		return CryptoJS.AES.encrypt(email, key,{iv:iv}).toString();
	},
	generateRandom: function(string_length) {
		let str = '';
		let asci;
		let low = 65;
		let high = 90
		for(let i = 0; i < string_length; i++) {
			asci = Math.floor((Math.random() * (high - low)) + low);
			str += String.fromCharCode(asci)
		}
		return str
	},
	getQrUrl(url) {
		return 'https://api.qrserver.com/v1/create-qr-code/?size=168x168&data='+url;
	},
	generateKey : async function() {
		const randomBytes = Util.promisify(crypto.randomBytes);
		const plain = (await randomBytes(48)).toString('base64').replace(/\W/g, '');
		return plain;
	}
}