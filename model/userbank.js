const mongoose = require('mongoose');

let userBankSchema = new mongoose.Schema({
  "user_id" 	  : { type:mongoose.Schema.Types.ObjectId, ref:'user_info', index:true },
  "currency"    : String,   
  "acc_name"    : String,
  "acc_number"  : String,
  "acc_type"    : String,
  "bank_name"   : String,
  "bank_branch" : String,
  "bank_code"   : String,
  "bank_proof"  : String,
  "status"      : { type:Number, default:1 },
  "bene_id"     : { type:String, default:"" },
  "bene_status" : { type:Number, default:1 },
  "created_at"  : { type:Date, default:Date.now },
  "updated_at"  : { type:Date, default:Date.now },
}, {"versionKey" : false});

module.exports = mongoose.model('user_bank', userBankSchema, 'user_bank');