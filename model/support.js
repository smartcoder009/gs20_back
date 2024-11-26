const mongoose  = require('mongoose')
const Schema = mongoose.Schema;

let SupportSchema = new Schema({
  "user_id"      : {type: mongoose.Schema.Types.ObjectId, ref: 'user_info'},   
  "subject"      : { type: String, default: '' },
  "username"     : { type: String, default: '' },
  "category"     : String,
  "reference_no" : String,    
  "status"       : { type: Number, default: 0 },
  "ticket_status": { type: Number, default: 0 },
  "reply"        : [{
                    "description":{type: String, default: ''},
                    "attachment" :{type: String, default: ''},
                    "replyBy"    : { type: Number, default: 0 },
                    "created_at" : { type: Date, default: Date.now }
                   }],
  "created_at"   : { type: Date, default: Date.now },
  "updated_at"   : { type: Date, default: Date.now },
  "token"        : String
}, {"versionKey" : false});

module.exports = mongoose.model('help_centre', SupportSchema, 'help_centre');