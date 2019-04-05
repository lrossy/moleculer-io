const { ServiceBroker } = require('moleculer')
const path = require('path')
const SocketIOService = require('../../');
const ApiService = require("moleculer-web");

const broker = new ServiceBroker({
  logger: true,
  logLevel: {
    'TRANSIT':'info',
    'IO': 'debug',
    '**':'info',
  },
});

broker.createService({
  name: "math",
  actions: {
    add(ctx) {
      return Number(ctx.params.a) + Number(ctx.params.b);
    }
  }
});
broker.createService({
  name: 'rooms',
  actions: {
    join(ctx){
      ctx.meta.$join = ctx.params.join
    },
    leave(ctx){
      ctx.meta.$leave = ctx.params.leave
    },
    get(ctx){
      return ctx.meta.$rooms
    }
  }
})
broker.createService({
  name: 'accounts',
  actions: {
    login(ctx){
      if(ctx.params.user == 'tiaod' && ctx.params.password == 'pass'){
        ctx.meta.user = {id:'tiaod'}
      }
    },
    getUserInfo(ctx){
      return ctx.meta.user
    },
    getClients(ctx){
      return broker.call('iocustom.getClients', {
        room: 'testRoom' //optional
      })
    },
    sendToRoom(ctx){
      // let clients = this.findClientsSocket('testRoom');
      // console.log('clients', clients)
      return broker.call('iocustom.checkClientsInsideRoom', {
        namespaces:'/',
        room: 'testRoom'
      })
    }
  },
  methods: {

  }
})
const ioService = broker.createService({
  name: 'iocustom',
  mixins: [SocketIOService],
  settings: {
    io:{
      options: {
        // adapter: redisAdapter({ host: 'localhost', port: 6379 })
      },
      namespaces: {
        '/':{
          authorization: true,
          middlewares:[function(socket, next){
            console.log('namespace middleware') //point to service instance.
            next()
          }],
          // packetMiddlewares:[],
          events:{
            'call':{
              whitelist: [
                'math.*',
                'say.*',
                'accounts.*',
                'rooms.*',
                'io.*'
              ],
              onBeforeCall: async function(ctx, socket, action, params, callOptions){
                console.log('before hook:', { action, params, callOptions })
              },
              onAfterCall:async function(ctx, socket, res){
                console.log('after hook', res)
              }
              // callOptions:{}
            },
            'upload':async function({name, type}, file, respond){
              let stream = new Duplex()
              stream.push(file)
              stream.push(null)
              await this.$service.broker.call('file.save', stream, { meta: {
                  filename: name
                }})
              respond(null, name)
            },
          }
        }
      }
    },
  },
  actions: {
    sendToRoom(ctx){
      let clients = this.emitToRoom('testRoom', '/', 'message 1234');
      console.log('emitToRoom', clients)
      return clients;
    },
    checkClientsInsideRoom:{
      params:{
        namespaces: 'string',
        room: 'string'
      },
      handler(ctx){
        console.log('ctx.params.namespaces', this.io.of(ctx.params.namespaces));
        this.io.of(ctx.params.namespaces).emit('testevent', "value");
      }
    }
  },
  methods: {
    emitToRoom(room, event, payload){
      this.logger.debug("Send room namespace message to '" + event + "':", payload);
      this.io.to(room).emit(event, payload );
    },
    socketAuthorize(socket, handler){
      console.log('Login using token:', socket.handshake.query.token)
      let accessToken = socket.handshake.query.token
      if (accessToken) {
        if (accessToken === "12345") {
          // valid credential
          return Promise.resolve({ id: 1, detail: "You are authorized using token.", name: "John Doe" })
        } else {
          // invalid credentials
          return Promise.reject()
        }
      } else {
        // anonymous user
        return Promise.resolve()
      }
    },
    findClientsSocket(roomId, namespace) {
      let res = []
        // the default namespace is "/"
        , ns = this.io.of(namespace ||"/");
      //
      // console.log('ns', ns)
      if (ns) {
        for (var id in ns.connected) {
          if(roomId) {
            var index = ns.connected[id].rooms.indexOf(roomId);
            if(index !== -1) {
              res.push(ns.connected[id]);
            }
          } else {
            res.push(ns.connected[id]);
          }
        }
      }
      return res;
    }
  }
});

broker.createService({
  name: 'gateway',
  mixins: [ApiService, SocketIOService], //Should after moleculer-web
  settings: {
    port: 3000,
    routes: [
      /**
       * Static routes
       */
      {
        path: "/",

        use: [
          // Serve static
          ApiService.serveStatic(path.join(__dirname, "public"))
        ],

        // Action aliases
        aliases: {

        },

        mappingPolicy: "restrict",
      },
    ],
  }
});

broker.start();