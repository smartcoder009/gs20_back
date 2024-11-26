let express = require('express');
let router = express.Router();
let multer  = require('multer');
let cloudinary = require('../../helpers/cloudinary');
var endecrypt = require('../../helpers/newendecryption');

let mongoose = require('mongoose');
let cms = require('../../model/cms');
let templates = require('../../model/emailtemplate');
let faq = require('../../model/faq');
let news = require('../../model/news');
let blog = require('../../model/blog');

let helpingLib = require('../../helpers/common');

//upload  storage
let storage = multer.diskStorage({
	filename: function (req, file, cb) {
		cb(null, file.originalname);
	}
});
let upload = multer({ storage: storage });

let response = {};

let updatedDate = ()=>{
	return new Date();
};

// get cms data
router.get('/get_cms', (req,res) => {
	cms.find({ }).sort({'updated_at': -1}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	})
});

router.post('/post_cms', (req,res) => {
	cms.find({"pagetype":req.body.pagehint},{_id:0}).select("pagecontent pagetitle").exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	})
});

router.get('/cms/:id', (req,res) => {
	var id = req.params.id;
	cms.findOne({"_id": id}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	})
});

router.post('/cmsUpdate',helpingLib.tokenMiddleware, (req,res) => {
	let info = req.body;
	let obj = {
		"pagetitle" : info.pagetitle,
		"pagecontent" : info.pagecontent,
		"updated_at" : updatedDate()
	};
	cms.updateOne({ "_id": info._id},{ "$set": obj },{multi: true}).exec(function(err, resUpdate){
		if(resUpdate) {
			response = {status : true, msg : "Successfully updated"};
		} else {
			response = {status : false, msg : "Invalid request. Please try again"};
		}
		res.json(response);	
	});
});

// get email template
router.get('/emailtemplate',helpingLib.tokenMiddleware, (req,res) => {
	templates.find({ }).sort({'title': 1}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	})
});

router.get('/template/:id', (req,res) => {
	var id = req.params.id;
	templates.findOne({"_id": id}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	})
});


router.post('/templateUpdate',helpingLib.tokenMiddleware, (req,res) => {
	let info = req.body;
	let obj = {
		"title" : info.title,
		"mailsubject" : info.mailsubject,
		"mailcontent" : info.mailcontent,    	
		"updated_at" : updatedDate()
	};
	templates.findOneAndUpdate({ "_id": info._id},{ "$set": obj },{multi: true}).exec(function(err, resUpdate){
		if(resUpdate) {
			response = {status : true, msg : "Successfully updated"};
		} else {
			response = {status : false, msg : "Invalid request. Please try again"};
		}
		res.json(response);	
	});

});

// get faq data
router.get('/faq',helpingLib.tokenMiddleware, (req,res) => {
	faq.find({ }).sort({created_at: -1}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		res.json({status : true, data : resData });		
	})
});

router.get('/get_faq', (req,res) => {
	faq.find({status:1},{_id:0}).select("question answer").sort({created_at: -1}).exec(function(error,resData){
		if (error) {
			return next(error);
		}		
		res.json({status : true, data : resData });		
	})
});

router.get('/faq/:id', (req,res) => {
	var id = req.params.id;
	faq.findOne({"_id": id}).exec(function(error,resData){
		if (error) {
			return next(error);
		}
		if(resData){
			res.json({status : true, data : resData });
		}
	})
});

router.post('/faqUpdate',helpingLib.tokenMiddleware, (req,res) => {
	let info = req.body;
	let obj = {
		"question" : info.question,
		"answer" : info.answer,
		"status" : info.status,
		"updated_at" : updatedDate()

	};
	faq.findOneAndUpdate({ "_id": info._id},{ "$set": obj },{multi: true}).exec(function(err, resUpdate){
		if(resUpdate) {
			response = {status : true, msg : "Successfully updated"};
		} else {
			response = {status : false, msg : "Invalid request. Please try again"};
		}
		res.json(response);	
	});
});

router.post('/faqAdd',helpingLib.tokenMiddleware, (req,res) => {
	var info = req.body;
	let obj = {		
		"question" : info.question,
		"answer" : info.answer,
		"status" : info.status
	};
	faq.find({'question':info.question}).exec(function (error, existData) {
		if (error) {
			return next(error);
		}
		if(existData.length > 0) {
			res.json({ status : false, msg : "FAQ already exist!" });
		} else {
			faq.create( obj, function(err,result) {      
				if(result)	{        
					res.json({ status : true, msg : "Successfully added" });
				} else {
					res.json({ status : false, msg : "Something went wrong. Please try again"});
				}
			});
		}
	});
});

router.get('/faqDelete/:id', (req, res) => {
	var id = req.params.id;
	faq.findOneAndRemove({"_id": id}).exec(function(err,resData){     
		if(resData){
			res.json({status : true, msg : "Successfully deleted"});
		} else {
			res.json({ status : false, msg : "Something went wrong. Please try again" });
		}              
	});

});

/* News */

router.get('/news',(req,res) => {
	news.find({status:1}).sort({updated_at: -1}).exec(function(error,resData){
		if (resData) {
			for(i=0;i<resData.length;i++){
				let userId   = resData[i]._id;
				var ept = endecrypt.encryptNew(userId.toString());
				var uri = encodeURIComponent(ept);
				resData[i].pagekey = uri;
		}
			res.json({status : true, data : resData });		
		}else{
			res.json({status : false});					
		}
	})
});

router.get('/get_news',(req,res) => {
	news.find({}).sort({updated_at: -1}).exec(function(error,resData){
		if (resData) {
			for(i=0;i<resData.length;i++){
				let userId   = resData[i]._id;
				var ept = endecrypt.encryptNew(userId.toString());
				var uri = encodeURIComponent(ept);
				resData[i].pagekey = uri;
		}
			res.json({status : true, data : resData });		
		}else{
			res.json({status : false});					
		}
	})
});


router.get('/get_news/:id', (req,res) => {
	var id = req.params.id;
	var Id = endecrypt.decryptNew(decodeURIComponent(id)); 
	news.findOne({"_id": Id},{_id:0,created_at:0,status:0}).exec(function(error,resData){
		if (resData) {
			res.json({success: 1, data: resData});
		}
		else{
			res.json({success: 0, msg: 'Try agin later'});
		}
	})
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

router.post('/newsAdd',helpingLib.tokenMiddleware,upload.single('news_img'), (req,res) => {
	var info = req.body;		
	news.find({'title':info.title}).exec(function (error, existData) {
		if (error) {
			return res.json({ status : false, msg:"Try again later!" });
		}
		if(existData.length > 0) {
			res.json({ status : false, msg : "Title already exist!" });
		} else {
			uploadcheck(req, function(uploadImg) {
				let obj = {
					"title"       : info.title,
					"description" : info.description,
					"content"     : info.content,
					"status"      : info.status
				};
				if(typeof uploadImg != 'undefined' && typeof uploadImg != undefined)
				{
					obj["news_image"] = uploadImg;
				}
				news.create( obj, function(err,result) {      
					if(result)	{        
						res.json({ status : true, msg : "Successfully added"});
					} else {
						res.json({ status : false, msg : "Something went wrong. Please Try again"});
					}
				});
			});
		}
	});	
});

router.post('/newsUpdate',helpingLib.tokenMiddleware,upload.single('news_img'), (req,res) => {
	let info = req.body;
	uploadcheck(req, function(uploadImg) {
		let obj = {
			"title"       : info.title,
			"description" : info.description,
			"content"     : info.content,
			"status"      : info.status,
			"updated_at"  : updatedDate()
		};

		if(typeof uploadImg != 'undefined' && typeof uploadImg != undefined && uploadImg != "")
		{
			obj["news_image"] = uploadImg;
		}
		news.findOneAndUpdate({ "_id": info._id},{ "$set": obj },{multi: true}).exec(function(err, resUpdate){
			if(resUpdate) {
				response = {status : true, msg : " Successfully updated"};
			} else {
				response = {status : false, msg : "Invalid request. Please Try again"};
			}
			res.json(response);	
		});
	});

});

router.get('/newsDelete/:id', (req, res) => {
	var id = req.params.id;
	news.findOneAndRemove({"_id": id}).exec(function(err,resData){     
		if(resData){
			res.json({status : true, msg : "Successfully deleted"});
		} else {
			res.json({ status : false, msg : "Something went wrong. Please try again" });
		}              
	});
});

/*blog*/
router.get('/blog',(req,res) => {
	blog.find({status:1}).sort({updated_at: -1}).exec(function(error,resData){
		if (resData) {
			for(i=0;i<resData.length;i++){
				let userId   = resData[i]._id;
				var ept = endecrypt.encryptNew(userId.toString());
				var uri = encodeURIComponent(ept);
				resData[i].pagekey = uri;
		}
			res.json({status : true, data : resData });		
		}else{
			res.json({status : false});					
		}
	})
});

router.get('/get_blog',(req,res) => {
	blog.find({}).sort({updated_at: -1}).exec(function(error,resData){
		if (resData) {
			for(i=0;i<resData.length;i++){
				let userId   = resData[i]._id;
				var ept = endecrypt.encryptNew(userId.toString());
				var uri = encodeURIComponent(ept);
				resData[i].pagekey = uri;
		}
			res.json({status : true, data : resData });		
		}else{
			res.json({status : false});					
		}
	})
});

router.get('/get_blogs/:id', (req,res) => {
	var id = req.params.id;
	var Id = endecrypt.decryptNew(decodeURIComponent(id)); 
	blog.findOne({"_id": Id},{_id:0,created_at:0,status:0}).exec(function(error,resData){
		if (resData) {
			res.json({success: 1, data: resData});
		}
		else{
			res.json({success: 0, msg: 'Try agin later'});
		}
	})
});

router.post('/blogAdd',helpingLib.tokenMiddleware,upload.single('news_img'), (req,res) => {
	var info = req.body;		
	blog.find({'title':info.title}).exec(function (error, existData) {
		if (error) {
			return res.json({ status : false, msg:"Try again later!" });
		}
		if(existData.length > 0) {
			res.json({ status : false, msg : "Title already exist!" });
		} else {
			uploadcheck(req, function(uploadImg) {
				let obj = {
					"title"       : info.title,
					"description" : info.description,
					"content"     : info.content,
					"status"      : info.status
				};
				if(typeof uploadImg != 'undefined' && typeof uploadImg != undefined)
				{
					obj["news_image"] = uploadImg;
				}
				blog.create( obj, function(err,result) {      
					if(result)	{        
						res.json({ status : true, msg : "Successfully added"});
					} else {
						res.json({ status : false, msg : "Something went wrong. Please Try again"});
					}
				});
			});
		}
	});	
});

router.post('/blogUpdate',helpingLib.tokenMiddleware,upload.single('news_img'), (req,res) => {
	let info = req.body;
	uploadcheck(req, function(uploadImg) {
		let obj = {
			"title"       : info.title,
			"content"     : info.content,
			"status"      : info.status,
			"updated_at"  : updatedDate()
		};

		if(typeof uploadImg != 'undefined' && typeof uploadImg != undefined && uploadImg != "")
		{
			obj["news_image"] = uploadImg;
		}
		blog.findOneAndUpdate({ "_id": info._id},{ "$set": obj },{multi: true}).exec(function(err, resUpdate){
			if(resUpdate) {
				response = {status : true, msg : " Successfully updated"};
			} else {
				response = {status : false, msg : "Invalid request. Please Try again"};
			}
			res.json(response);	
		});
	});

});

router.get('/blogDelete/:id', (req, res) => {
	var id = req.params.id;
	blog.findOneAndRemove({"_id": id}).exec(function(err,resData){     
		if(resData){
			res.json({status : true, msg : "Successfully deleted"});
		} else {
			res.json({ status : false, msg : "Something went wrong. Please try again" });
		}              
	});
});

module.exports = router;