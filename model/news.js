const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let newsSchema = new Schema({
  "title": String,
  "content": String,
  "description": String,
  "pagekey": String,
  "news_image": String,
  "status" : {type: Number, default: 1}, // 1- active 0 - deactive
  "created_at": { type: Date, default: Date.now },
  "updated_at": { type: Date, default: Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('news', newsSchema);