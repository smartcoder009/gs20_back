const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let userhisSchema = new Schema({
  "user_id" 	: { type:mongoose.Schema.Types.ObjectId, ref:'user_info' },
  "ip_address": String,   
  "browser"   : String,
  "image"     : String,
  "deviceinfo": String,
  "created_at": { type:Date, default:Date.now },
  "status"    : {type:Number, default:1},
  "ASIMI_status": {type:Number, default:0},
  "email"     : String
}, {"versionKey" : false});

module.exports = mongoose.model('user_history', userhisSchema,'user_history');