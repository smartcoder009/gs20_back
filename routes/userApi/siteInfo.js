var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var settings = require('../../model/siteSettings');
var cms = require('../../model/cms');
var faq = require('../../model/faq');
var news = require('../../model/news');
var country = require('../../model/country');
var currency = require('../../model/currency');

let response = {};
let updatedDate = ()=>{ return new Date(); };

// get site info
router.get('/', (req,res) => {
	settings.find({},{facebook:1,twitter:1,linkedin:1,logo:1, favicon:1, copyright:1,contactnumber:1,contact_mail:1}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	})
});

router.get('/country', (req,res) => {
	country.find({ status: 1 }).select("country_name").exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });		
	})
});

router.get('/currency', (req,res) => {
	currency.find({ status: 1, type:{$ne:'fiat'} }).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });		
	})
});

router.post('/cms/:langName', (req,res) => {
	var info = req.body;
	var langName = req.params.langName;
	cms.findOne({"language":langName,"pagekey": info.type}).select("pagetitle pagecontent").exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		} else {
			res.json({status : false, data : "Invalid request" });
		}
	})
});

// get faq data
router.get('/faq/:langName', (req,res) => {
	var langName = req.params.langName;
	faq.find({ "language":langName,status: 1 }).sort({createdDate: -1}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });		
	})
});

// get news data
router.get('/news/:langName', (req,res) => {
	var langName = req.params.langName;
	news.find({ "language":langName,status: 1 }).sort({modifiedDate: -1}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });	
	})
});

module.exports = router;