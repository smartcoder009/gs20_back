const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let settingSchema = new Schema({
  "contact_mail"     : String, 
  "site_url"         : String,
  "site_name"        : String,
  "sitemode"         : {type: String, default:"1"}, 
  "copyright"        : String,
  "contactnumber"    : Number,
  "address"          : String,
  "facebook"         : {type: String, default: ''},
  "twitter"          : {type: String, default: ''},
  "linkedin"         : {type: String, default: ''}, 
  "telegram"         : {type: String, default: ''},
  "refLevel1"        : Number,
  "refLevel2"        : Number,
  "refBasic"         : Number,
  "singleToken"      : Number,
  "multipleToken"    : Number,
  "singleCoin"       : Number,
  "multipleCoin"     : Number,
  "mainPer"          : Number,
  "updated_at"       : { type: Date, default: Date.now }
}, {"versionKey"  : false});

module.exports = mongoose.model('siteSettings', settingSchema, 'sitesettings');