const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let faqSchema = new Schema({
  
  "question"  : String,
  "answer"    : String,
  "status"    : {type: Number, default: 1}, // 1- active 0 - deactive
  "created_at": { type: Date, default: Date.now },
  "updated_at": { type: Date, default: Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('faq', faqSchema, 'faq');