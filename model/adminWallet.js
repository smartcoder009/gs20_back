const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let adminSchema = new Schema({
  "username"  : String,
  "ownermail" : { type: String, unique: true },
  "ownerkey" : String,
  "pattern" : String,
  "profileimg" : String,
  "reset_code": String,
  "tfa_status" : { type: Number, default: 0 },
  "tfa_code" : String,
  "tfa_url" : String,
  "createdDate": { type: Date, default: Date.now }, 
  "modifiedDate": { type: Date, default: Date.now },
  "status"  : { type: Number, default: 1 }
}, {"versionKey" : false});

module.exports = mongoose.model('adminWallet', adminSchema,'adminWallet');