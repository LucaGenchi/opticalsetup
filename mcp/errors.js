// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
export class SceneError extends Error {
  constructor(message, code = 'INVALID_INPUT') { super(message); this.code = code; }
}
