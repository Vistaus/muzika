import Gtk from "gi://Gtk?version=4.0";

import { Match, match, MatchFunction, MatchResult } from "path-to-regexp";

import { HomePage } from "./components/home.js";
import { PlaylistPage } from "./components/playlist.js";
import { Loading } from "./components/loading.js";

export type EndpointCtx = {
  match: MatchResult<Record<string, string>>;
  url: URL;
};

export type Endpoint<C extends Gtk.Widget> = {
  uri: string;
  title: string;
  component: () => C;
  load: <D extends C>(component: D, ctx: EndpointCtx) => void | Promise<void>;
};

export const endpoints: Endpoint<Gtk.Widget>[] = [
  {
    uri: "home",
    title: "Home",
    component: () => new HomePage(),
    load(component: HomePage) {
      return component.load_home();
    },
  } as Endpoint<HomePage>,
  {
    uri: "playlist/:playlistId",
    title: "Playlist",
    component: () => new PlaylistPage(),
    load(component: PlaylistPage, ctx) {
      if (!ctx.match) {
        throw new Error("No match");
      }

      return component.load_playlist(ctx.match.params.playlistId);
    },
  } as Endpoint<PlaylistPage>,
];

export class Navigator {
  private _stack: Gtk.Stack;
  private _header: Gtk.HeaderBar;

  private match_map: Map<MatchFunction, Endpoint<Gtk.Widget>> = new Map();

  loading = false;

  constructor(stack: Gtk.Stack, header: Gtk.HeaderBar) {
    this._stack = stack;
    this._header = header;

    this.add_loading_page();

    this.match_map = new Map();

    for (const endpoint of endpoints) {
      const fn = match(endpoint.uri);
      this.match_map.set(fn, endpoint);
    }
  }

  private add_loading_page() {
    const loading_page = new Loading();

    this._stack.add_named(loading_page, "loading");
  }

  private endpoint(
    uri: string,
    match: MatchResult,
    endpoint: Endpoint<Gtk.Widget>,
  ) {
    for (const [fn, endpoint] of this.match_map) {
      if (fn(uri) === match) {
        return endpoint;
      }
    }

    let component: Gtk.Widget;

    const got_component = this._stack.get_child_by_name(endpoint.uri);
    if (got_component) {
      component = got_component;
    } else {
      component = endpoint.component();
      this._stack.add_named(component, endpoint.uri);
    }

    const response = endpoint.load(component, {
      match: match as MatchResult<Record<string, string>>,
      url: new URL("muzika:" + uri),
    });

    if (!response) return;

    this.loading = true;

    // show loading page if it takes too long
    const timeout = setTimeout(() => {
      this._header.set_title_widget(Gtk.Label.new("Loading..."));
      this._stack.set_visible_child_name("loading");
    }, 1000);

    response.then(() => {
      clearTimeout(timeout);

      this.loading = false;
      this._header.set_title_widget(Gtk.Label.new(endpoint.title));

      this._stack.set_visible_child_name(endpoint.uri);
    });

    return null;
  }

  navigate(uri: string) {
    // muzika:home to
    // muzika/home
    // only when it's not escaped (i.e not prefixed with \)
    const path = uri.replace(/(?<!\\):/g, "/");

    for (const [fn, endpoint] of this.match_map) {
      const match = fn(path);

      if (match) {
        return this.endpoint(uri, match, endpoint);
      }
    }
  }
}
