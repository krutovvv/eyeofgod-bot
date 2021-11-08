import { Controller, Logger } from '@nestjs/common';
import { Client } from 'tdl';
import { TDLib } from 'tdl-tdlib-addon';
import { AppService } from './app.service';
import * as fs from 'fs';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  private throttle = 7000;
  private input = './input';
  private output = './output';

  constructor(private appService: AppService) {}

  async onModuleInit() {
    const result: {query: string, original: string[], check: {label: string, slug: string, value: string}[]}[] = [];

    const client = new Client(new TDLib(), {
      apiId: parseInt(process.env.TELEGRAM_APP_ID, 10),
      apiHash: process.env.TELEGRAM_API_HASH,
    });

    client.on('error', console.error);
    client.on('update', update => {
      if (update._ === 'updateChatLastMessage') {
        this.appService.handler(update);
      }
    });

    await client.connect();
    await client.login();

    let throttle = (new Date()).getTime();

    const elements = fs.readdirSync(this.input);
    for (let e = 0; e < elements.length; e ++) {
      const stats = fs.statSync(`${this.input}/${elements[e]}`);
      if (stats.isFile() && /\.csv$/iu.test(elements[e])) {
        const file = fs.readFileSync(`${this.input}/${elements[e]}`, {encoding: 'utf-8'});
        const table = file.split('\n')
          .filter(o => o !== '' && o.indexOf(process.env.CSV_DELIMITER) !== -1)
          .map(row => row.split(process.env.CSV_DELIMITER))
          .filter(o => o.length > 0);

        if (table.length > 0) {
          const header = (process.env.CSV_HEADER + '') === 'true';
          const skip = header ? 1 : 0;
          for (let i = skip; i < table.length; i ++) {
            this.logger.log(`${elements[e]} ${i + (header ? 0 : 1)}/${table.length}`);

            const query = table[i][process.env.CSV_PHONE || process.env.CSV_EMAIL] || table[i][process.env.CSV_EMAIL || process.env.CSV_PHONE];
            let check;
            try {
              check = await this.appService.send(query, client);
            } catch(e) {
              check = [];
            }
            result.push({query: query, original: table[i], check: check});

            const headers = [
              ... new Set(result
              .map(o => o.check)
              .map(o => o.map(k => k.label))
              .reduce((a, b) => a.concat(b), []))
            ].sort((a, b) => a > b ? -1 : b > a ? 1 : 0);

            const append: string[][] = [];
            for (let u = 0; u < result.length; u ++) {
              const row = [];
              for (let d = 0; d < headers.length; d ++) {
                const index = result[u].check.findIndex(o => o.label === headers[d]);
                const value = index !== -1 ? result[u].check[index].value : '';
                row.push(value);
              }
              append.push(row);
            }

            const data: string[][] = [];
            if (skip > 0) {
              data[0] = (JSON.parse(JSON.stringify(result[0].original)) as string[]).concat(headers);
            }
            for (let d = 0; d < result.length; d ++) {
              data.push((JSON.parse(JSON.stringify(result[d].original)) as string[]).concat(JSON.parse(JSON.stringify(append[d]))));
            }

            fs.writeFileSync(`${this.output}/${elements[e]}`, data.map(r => r.join(process.env.CSV_DELIMITER)).join('\n'));
            await new Promise(resolve => setTimeout(() => resolve(1), Math.max(0, (this.throttle - ((new Date()).getTime() - throttle)))));
            throttle = (new Date()).getTime();
          }
        }
      }
    }

    this.logger.log(`Complete!`);
  }
}
