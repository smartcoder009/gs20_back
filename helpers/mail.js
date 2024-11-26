var nodemailer = require('nodemailer');
var mongoose = require('mongoose');
var emailtemp = require('../model/emailtemplate');
var settings = require('../model/siteSettings');
var mailsmtp = require('../config/coin');
const encdec = require('./newendecryption');

var transporter = nodemailer.createTransport({
	host: 'smtpout.secureserver.net',
	port: '465',
	secure: true,
	auth: {
		user: 'notifications@gs20.exchange',
		pass: 'Gs20@notification!2022'
	}
});

module.exports = {
	sendMail : function(to, tempName, specialVar, callback) {
		emailtemp.find({ "title": tempName }).exec(function(etemperr,tempContent) {
			settings.find({}).select("site_url facebook twitter linkedin telegram").exec(function(siteErr,siteCnt) {
				var siteInfo = {
					'###SITEURL###'	: siteCnt[0].site_url,
					'###FBURL###'	: siteCnt[0].facebook,
					'###TWURL###'	: siteCnt[0].twitter,
					'###TGURL###'	: siteCnt[0].telegram,
					'###INURL###'	: siteCnt[0].linkedin
				};
				if(to == "admin") {
					to = "notifications@gs20.exchange";
				}
				if(to == "support") {
					to = "support@gs20.exchange";
				}
				specialVars = Object.assign(specialVar,siteInfo);
				var subject = tempContent[0].mailsubject;
				var html = tempContent[0].mailcontent;

				for( var key in specialVars ) {
					if( specialVars.hasOwnProperty( key ) ) {
						subject = subject.replace( key, specialVars[ key ] );
					}
				}
				for( var key in specialVars ) {
					if( specialVars.hasOwnProperty( key ) ) {
						html = html.replace( key, specialVars[ key ] )
					}
				}
				let mailOptions = {
					from: '"GS20 Exchange" <notifications@gs20.exchange>',
					to: to,
					subject: subject,
					html: html
				}; 			

				transporter.sendMail(mailOptions, function(error, info){
					if (error) {
						console.log('Email error:' + error);
					}
					callback(true);
				});
			});
		});
	}
};