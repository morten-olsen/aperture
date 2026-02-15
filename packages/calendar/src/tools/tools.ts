import { list } from './tools.list.js';
import { search } from './tools.search.js';
import { get } from './tools.get.js';
import { addNote } from './tools.add-note.js';
import { updateNote } from './tools.update-note.js';
import { deleteNote } from './tools.delete-note.js';

const calendarTools = [list, search, get, addNote, updateNote, deleteNote];

export { calendarTools };
