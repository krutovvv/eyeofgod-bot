import { Injectable } from '@nestjs/common';
import Client from 'tdl';
import {
  inlineKeyboardButtonTypeUrl, messagePhoto,
  messageText,
  replyMarkupInlineKeyboard,
  updateChatLastMessage
} from 'tdlib-types';
import * as level from 'level';

@Injectable()
export class AppService {
  private response: updateChatLastMessage;
  private interval;
  private timeout = 60000;
  private pattern = /(^[а-яА-Я]+): *([^:\n]+)|^[^a-zA-Zа-яА-Я]+ *([^:\n]+): ([^\n]+)|^[^a-zA-Zа-яА-Я]+ *([^:\n]+): *\n[^a-zA-Zа-яА-Я]* *([^\n]+)/gim;
  private database = level('./level');
  private stops = ['Репутация', 'Расширенный поиск'];

  constructor() {
  }

  public send(message: string, client: Client): Promise<{label: string, value: string}[]> {
    return new Promise((resolve, reject) => {
      client.invoke({_: 'sendMessage', chat_id: 1854404409, input_message_content: {_: 'inputMessageText', text: {_: 'formattedText', text: message}}});

      const timeout = (new Date()).getTime();
      this.interval = setInterval(() => {
        if ((((new Date()).getTime()) - timeout) > this.timeout) {
          this.response = null;
          reject();
        }
        if (this.response) {
          const parse = this.parse(this.response);
          const text = this.text(this.response);
          const check = message.indexOf('@') !== -1 ? message.split('@')[0] : message.indexOf('7') !== -1 ? message.replace(/.*(7[0-9]{1,3}).*/gi, '$1') : message;

          if (text.indexOf(check) !== -1) {
            clearInterval(this.interval);
            resolve(parse);
            this.response = null;
          } else {
            this.response = null;
          }
        }
      }, 100);
    });
  }

  public handler(message: updateChatLastMessage) {
    const text = this.text(message);
    const keyboard = ((message.last_message.reply_markup || []) as replyMarkupInlineKeyboard)?.rows || [];

    if (text && this.pattern.test(text) && keyboard.length > 1) {
      this.database.get(message.last_message.id).catch(() => {
        this.database.put(message.last_message.id, 1).then(() => {
          this.response = message;
        });
      });
    }
  }

  public parse(message: updateChatLastMessage): {label: string, value: string}[] {
    const pattern = this.matchAll(this.text(message), this.pattern);
    const delimiter = new RegExp(process.env.CSV_DELIMITER, 'g');

    const parse: {label: string, value: string}[] = [];
    for (let i = 0; i < pattern.length; i ++) {
      const item = pattern[i];
      const label = this.capitalizeFirstLetter((item[0] || '').trim());
      const value = (item[1] + '').replace(delimiter, ' ').trim();

      if (value) {
        parse.push({label: label, value: value});
      }
    }
    const keyboard = (((message.last_message.reply_markup || []) as replyMarkupInlineKeyboard)?.rows || [])
      .map(o => o
        .filter(u => u.type._ === 'inlineKeyboardButtonTypeUrl')
        .map(u => ({label: u.text.replace(/[^а-яА-Яa-zA-Z ]/g, '').trim(), value: ((u.type as inlineKeyboardButtonTypeUrl).url + '').replace(delimiter, ' ').trim()}))
      ).reduce((a, b) => a.concat(b), []);

    const result = [];
    for (let i = 0; i < parse.length; i ++) {
      const index = keyboard.findIndex(o => o.label === parse[i].label);
      if (index === -1) {
        result.push(parse[i]);
      }
    }
    return result.concat(keyboard).filter(o => this.stops.indexOf(o.label) === -1);
  }

  public matchAll(str: string, regexp: RegExp): string[][] {
    const result = [];
    let m;
    while ((m = regexp.exec(str)) !== null) {
      if (m.index === regexp.lastIndex) {
        regexp.lastIndex++;
      }
      const group = [];
      m.forEach((match, groupIndex) => {
        if (groupIndex > 0 && match) {
          group.push(match);
        }
      });
      result.push(group);
    }
    return result;
  }

  private capitalizeFirstLetter(string) {
    string = (string + '').toLowerCase();
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  private text(message: updateChatLastMessage): string {
    return (message.last_message?.content as messageText)?.text?.text || (message.last_message?.content as messagePhoto)?.caption?.text || '';
  }
}
