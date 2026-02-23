import { list } from './tools.list.js';
import { search } from './tools.search.js';
import { get } from './tools.get.js';
import { sync } from './tools.sync.js';
import { addNote } from './tools.add-note.js';
import { updateNote } from './tools.update-note.js';
import { deleteNote } from './tools.delete-note.js';

const calendarTools = [list, search, get, sync, addNote, updateNote, deleteNote];

export { calendarTools };
