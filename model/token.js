const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let tokenSchema = new Schema({
  "user_id"         : { type:mongoose.Schema.Types.ObjectId, ref:'user_info' },
  "token_name"  : String,
  "contract_address" : String,
  "token_symbol" : String,
  "basecoin" : { type: String, default: "ETH"},
  "logo" : String,
  "decimal":Number,  
  "market": [],  
  "status"  : { type: Number, default: 0 }, // 0-pending,1-approve,2-rejected
  "coin_interface":{ type: String, default: ""},
  "coin_website":{ type: String, default: ""},
  "annoucements":{ type: String, default: ""},
  "githubLink":{ type: String, default: ""},
  "explorerLink":{ type: String, default: ""},
  "createdDate": { type: Date, default: Date.now }, 
  "modifiedDate": { type: Date, default: Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('token', tokenSchema,'token');