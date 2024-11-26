const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let listCoinSchema = new Schema({
  "user_id"         : { type:mongoose.Schema.Types.ObjectId, ref:'user_info' },
  "email"           : String,
  "coin_name"       : String, 
  "coin_ticker"     : {type: String, default: ''},
  "coin_algo"       : {type: String, default: ''},
  "source_code"     : {type: String, default: ''},
  "block_explorer"  : {type: String, default: ''},
  "ann_thread"      : {type: String, default: ''},
  "website"         : {type: String, default: ''},
  "logo"            : {type: String, default: ''},
  "twitter"         : {type: String, default: ''}, 
  "tele_group"      : {type: String, default: ''},
  "any_other"       : {type: String, default: ''},
  "list_type"       : {type: String, default: ''},
  "status"          : {type: String, default: ''},
  "created_at"      : { type:Date, default:Date.now },
  "updated_at"      : { type:Date, default:Date.now }
}, {"versionKey"  : false});

module.exports = mongoose.model('listCoin', listCoinSchema, 'listCoin');