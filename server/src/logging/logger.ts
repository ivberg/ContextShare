interface LogFields { [k: string]: any; }

function redact(v: any): any {
  if(!v) return v;
  if(typeof v === 'string'){
    if(v.length > 8) return v.slice(0,4) + '…redacted';
    return 'redacted';
  }
  return 'redacted';
}

function sanitize(obj: LogFields): LogFields {
  const out: LogFields = {};
  for(const [k, v] of Object.entries(obj)){
    if(/authorization|token|secret/i.test(k)){
      out[k] = redact(v);
    } else out[k] = v;
  }
  return out;
}

function write(level: string, obj: any, msg?: string){
  if(typeof obj === 'string'){
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](obj);
    return;
  }
  const payload = { level, time: new Date().toISOString(), ...sanitize(obj||{}), msg };
  const line = JSON.stringify(payload);
  if(level === 'error') console.error(line); else if(level === 'warn') console.warn(line); else console.log(line);
}

export const logger = {
  info: (obj: any, msg?: string) => write('info', obj, msg),
  warn: (obj: any, msg?: string) => write('warn', obj, msg),
  error: (obj: any, msg?: string) => write('error', obj, msg)
};
