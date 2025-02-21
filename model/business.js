const mongoose = require('mongoose');
const Schema = mongoose.Schema;
var ObjectIdSchema = Schema.ObjectId;
var ObjectId = mongoose.Types.ObjectId;

let usersSchema = new Schema({
  "user_id"       : { type:mongoose.Schema.Types.ObjectId, ref:'user_info', index:true },
  "username1"     : { type: String, default: '' },
  "dob1"          : { type: String, default: '' },
  "country1"      : { type: String, default: '' },
  "alpha_code1"   : { type: String, default: '' },
  "image1"        : { type: String, default: '' },
  "username2"     : { type: String, default: '' },
  "dob2"          : { type: String, default: '' },
  "country2"      : { type: String, default: '' },
  "alpha_code2"   : { type: String, default: '' },
  "image2"        : { type: String, default: '' },
  "username3"     : { type: String, default: '' },
  "dob3"          : { type: String, default: '' },
  "country3"      : { type: String, default: '' },
  "id_number3"    : { type: String, default: '' },
  "image3"        : { type: String, default: '' },
  "step1_status"  : { type: Number, default: 0 },
  "value1"        : { type: String, default: '' },
  "value2"        : { type: String, default: '' },
  "value3"        : { type: String, default: '' },
  "value4"        : { type: String, default: '' },
  "value5"        : { type: String, default: '' },
  "value6"        : { type: String, default: '' },
  "value7"        : { type: String, default: '' },
  "value8"        : { type: String, default: '' },
  "value9"        : { type: String, default: '' },
  "step2_status"  : { type: Number, default: 0 },
  "proof1"        : { type: String, default: '' },
  "proof2"        : { type: String, default: '' },
  "proof3"        : { type: String, default: '' },
  "proof4"        : { type: String, default: '' },
  "proof5"        : { type: String, default: '' },
  "proof6"        : { type: String, default: '' },
  "proof7"        : { type: String, default: '' },
  "proof_status1" : { type: Number, default: 0 },
  "proof_status2" : { type: Number, default: 0 },
  "proof_status3" : { type: Number, default: 0 },
  "proof_status4" : { type: Number, default: 0 },
  "proof_status5" : { type: Number, default: 0 },
  "proof_status6" : { type: Number, default: 0 },
  "proof_status7" : { type: Number, default: 0 },
  "proof_reject1" : String,
  "proof_reject2" : String,
  "proof_reject3" : String,
  "proof_reject4" : String,
  "proof_reject5" : String,
  "proof_reject6" : String,
  "proof_reject7" : String,
  "proof_type1"   : { type: String, default: '' },
  "proof_type2"   : { type: String, default: '' },
  "proof_type3"   : { type: String, default: '' },
  "proof_type4"   : { type: String, default: '' },
  "proof_type5"   : { type: String, default: '' },
  "proof_type6"   : { type: String, default: '' },
  "proof_type7"   : { type: String, default: '' },
  "step3_status"  : { type: Number, default: 0 },
  "created_at"    : { type: Date, default: Date.now },
  "updated_at"    : { type: Date, default: Date.now },
  "dir"           : {type: Array, default: []},
  "own"           : {type: Array, default: []},
  "res"           : {type: Array, default: []},
  "step2_name"    : {type: String, default: ''},
  "step0_status"  : { type: Number, default: 0 },
  "person"        : { type: String, default: '' },
  "shares"        : { type: String, default: '' },
  "legother"        : { type: String, default: '' },
  "trustother"        : { type: String, default: '' },
  "leg"           : {type: Array, default: []},
  "additionalData": {type: Array, default: []},
}, {"versionKey"  : false});

module.exports = mongoose.model('business', usersSchema, 'business');
