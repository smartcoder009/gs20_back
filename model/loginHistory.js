const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let usersSchema = new Schema({
  "userId" : {type: mongoose.Schema.Types.ObjectId, ref: 'users'},
  "ipaddress" : String,
  "location"  : String,
  "browser"   : String,
  "deviceinfo": String,
  "datetime"  : Date,
  "status"    : String
}, {"versionKey" : false});

module.exports = mongoose.model('loginHistory', usersSchema);