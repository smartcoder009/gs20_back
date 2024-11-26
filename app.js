const createError = require('http-errors');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require("fs");
const http = require('http');
const https = require('https')
const socketio = require('socket.io');

const port = process.env.PORT;
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const indexRouter = require('./routes/adminApi/index');
const usersRouter = require('./routes/adminApi/users');
const adminRouter = require('./routes/adminApi/admin');
const cmsRouter = require('./routes/adminApi/cms');
const homeRouter = require('./routes/adminApi/home');
const walletapi = require('./routes/adminApi/userWallet');
const admin_deposit = require('./routes/adminApi/admin_deposit');
const admin_withdraw = require('./routes/adminApi/admin_withdraw');
const admin_trade = require('./routes/adminApi/tradehistory');
const currencydetailsapi = require('./routes/adminApi/currencydetails');
const p2padmin = require('./routes/adminApi/p2p');

// user modules
const datas = require("./model/datas");
const userHome = require('./routes/userApi/basic');
const siteInfo = require('./routes/userApi/siteInfo');
const support = require('./routes/userApi/support');
const profile = require('./routes/userApi/profile');
const wallet = require('./routes/userApi/wallet');
const trans = require('./routes/userApi/transaction');
const tfa = require('./routes/userApi/tfa');
const history = require('./routes/userApi/history');
const trade = require('./routes/userApi/trade');
const currency = require('./routes/userApi/currency');
const p2p = require('./routes/userApi/p2p');
const api = require('./routes/userApi/api');

// Admin wallet modules
const wltadmin = require('./routes/walletApi/admin');
const wltadminTransactions = require('./routes/walletApi/wltadminTransactions');

var app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev', {
  skip: function (req, res) { return res.statusCode < 400 }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});
// set port
app.set('port', port);

app.use('/', indexRouter);
app.use('/admin', adminRouter);
app.use('/cms', cmsRouter);
app.use('/home', homeRouter);
app.use('/users', usersRouter);
app.use('/admin_deposit', admin_deposit);
app.use('/admin_withdraw', admin_withdraw);
app.use('/userWallet', walletapi);
app.use('/tradehistory', admin_trade);
app.use('/currencydetailsapi', currencydetailsapi);
app.use('/p2padmin', p2padmin);

// user panel
app.use('/basic', userHome);
app.use('/siteinfo', siteInfo);
app.use('/support', support);
app.use('/profile', profile);
app.use('/wallet', wallet);
app.use('/trans', trans);
app.use('/tfa', tfa);
app.use('/history', history);
app.use('/trade', trade);
app.use('/currency',currency);
app.use('/p2p',p2p);
app.use('/api', api);

// Admin wallet
app.use('/wltadmin', wltadmin);
app.use('/wltadmintrans', wltadminTransactions);

var mongoose = require( 'mongoose' );
var server;
var credentials = {};

if(process.env.NODE_ENV == 'production'){
  var server = https.createServer(credentials, app);
  server.listen(port, () => {
    console.log('Checks - HTTPS Server running on port '+port);
  });
} else {
  var server = http.createServer(app);
  server.listen(port, () => {
    console.log('HTTP Server running on port '+port);
  });
}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});
// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

/*------------- SOCKET --------------------*/
// var io = socketio.listen(server);
var io = socketio.listen(server, {pingInterval:200000000, pingTimeout:500000000, transports:['websocket', 'polling']});
io.set('origins', "localhost:1201:*, 192.168.0.24:1201:*, gs20.exchange:*, oeyfnvpdjh.gs20.exchange:*, kspedfhabc.gs20.exchange:*" )

let tradeHelper = require('./helpers/trade');
tradeHelper.SocketInit(io);
let binSocket = require('./routes/okex');
binSocket.SocketInit(io);
let p2pHlp = require('./helpers/p2p');
p2pHlp.SocketInit(io);

io.on('connection', function (socket) {
  socket.on('raiseTicket', function (data) {
    tradeHelper.createOrder(data, io);
  })
  socket.on('deactive', function (data) {
    io.emit('deactive', data);
  })
  socket.on('check_block', function (data) {
    io.emit('check_block', data);
  })
  socket.on('security', function (data) {
    io.emit('security', data);
  })
  socket.on('userEmit', function (data) {
    tradeHelper.userEmit(data);
  });
  socket.on('p2pUserEmit', function (data) {
    p2pHlp.p2pUserEmit(data);
  });
  socket.on('joined', function (data) {
    io.sockets.emit('joined', {'trade':1});
  });
  socket.on('join', function (data) {
    if (data.user_id && data.user_id != 0) {
      socket.join(data.user_id);
    } else {
      socket.join('Pair-' + data.pair_id);
    }
  });
  socket.on('binance_room', function(room) {
    socket.join(room);
  });
  socket.on('leave_room', function(room) {
    socket.leave(room);
  });
});

module.exports = app;