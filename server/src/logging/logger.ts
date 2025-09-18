interface LogFields { [k: string]: unknown; }

function redact(v: unknown): string {
  if(!v) {return 'undefined';}
  if(typeof v === 'string'){
    if(v.length > 8) {return v.slice(0,4) + '…redacted';}
    return 'redacted';
  }
  return 'redacted';
}

function sanitize(obj: LogFields): LogFields {
  const out: LogFields = {};
  for(const [k, v] of Object.entries(obj)){
    if(/authorization|token|secret/i.test(k)){
      out[k] = redact(v);
    } else {out[k] = v;}
  }
  return out;
}

function write(level: string, obj: LogFields | string, msg?: string): void {
  if(typeof obj === 'string'){
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](obj);
    return;
  }
  const payload = { level, time: new Date().toISOString(), ...sanitize(obj ?? {}), msg };
  const line = JSON.stringify(payload);
  // eslint-disable-next-line no-console
  if(level === 'error') {console.error(line);} else if(level === 'warn') {console.warn(line);} else {console.log(line);}
}

export const logger = {
  info: (obj: LogFields | string, msg?: string): void => write('info', obj, msg),
  warn: (obj: LogFields | string, msg?: string): void => write('warn', obj, msg),
  error: (obj: LogFields | string, msg?: string): void => write('error', obj, msg)
};
