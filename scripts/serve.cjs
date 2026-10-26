/* Serve only public website assets; never expose reports, imports, functions or credentials. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const allowed=new Set(['code.html','mobile.css','mobile.js','task-form.css','auth-ui.css','school-data.js','task-form.js','task-dashboard.js','auth-ui.js']);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer((req,res)=>{
 let file;try{file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'code.html';}catch{res.writeHead(400).end();return;}
 if(!['GET','HEAD'].includes(req.method)||!allowed.has(file)){res.writeHead(404).end('Not found');return;}
 fs.readFile(path.join(root,file),(error,data)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:data);});
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Cổng 3000 đang được sử dụng. Kiểm tra tiến trình hiện có trước khi chạy lại.':error.message);process.exitCode=1;});
server.listen(3000,'127.0.0.1',()=>console.log('Website: http://localhost:3000/code.html | PID '+process.pid));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
