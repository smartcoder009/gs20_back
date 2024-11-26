const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let wltTransactions = new Schema({
  "adminId"          : {type:mongoose.Schema.Types.ObjectId, ref:'adminWallet'},
  "txnid"            : {type:String, default:''},
  "withdraw_address" : String,
  "withdraw_tag"     : {type:String, default:''},
  "currency"         : String,
  "total_amount"     : Number,
  "cointype"         : String,
  "statusLink"       : String,
  "basecoin"         : {type:String, default:''},
  "ip_address"       : {type:String, default:''},
  "status"           : {type:String, default:'Pending'},
  "created_at"       : {type:Date, default:Date.now},
  "updated_at"       : {type:Date, default:Date.now},
}, {"versionKey" : false});

module.exports = mongoose.model('wltTransactions', wltTransactions, 'wltTransactions');