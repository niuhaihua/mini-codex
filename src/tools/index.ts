import {
  listFiles
} from "./listFiles.js";

import {
  readFile
} from "./readFile.js";

import {
  writeFile
} from "./writeFile.js";

import {
  editFile
} from "./editFile.js";

import {
  deleteFile
} from "./deleteFile.js";

import {
  searchFiles
} from "./searchFiles.js";

import {
  runCommand
} from "./runCommand.js";


export const tools = {
  list_files: listFiles,

  read_file: readFile,

  write_file: writeFile,

  edit_file: editFile,

  delete_file: deleteFile,

  search_files: searchFiles,

  run_command: runCommand,
};