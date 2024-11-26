const cloudinary = require('cloudinary');

cloudinary.config({
  cloud_name:'dsgb6pefn',
  api_key: '337225419351355',
  api_secret: 'luxs2S31CYk0-4FK2HYaHvAOSgU'
});

module.exports = {
	uploadImage : function(imageName, callback) {
		try {
			cloudinary.v2.uploader.upload(imageName, {folder:'KYC', use_filename:true}, function(error, result) {
				if(error == undefined) { callback(result) } else { callback(undefined);	}
			});
		} catch(e) {
			callback(undefined);
		}
	},
	uploadProfile : function(imageName, callback) {
		try {
			cloudinary.v2.uploader.upload(imageName, {folder:'Profile', use_filename:true}, function(error, result) {
				if(error == undefined) { callback(result) } else { callback(undefined);	}
			});
		} catch(e) {
			callback(undefined);
		}
	},
	uploadBank : function(imageName, callback) {
		try {
			cloudinary.v2.uploader.upload(imageName, {folder:'Bank', use_filename:true}, function(error, result) {
				if(error == undefined) { callback(result) } else { callback(undefined);	}
			});
		} catch(e) {
			callback(undefined);
		}
	}
};