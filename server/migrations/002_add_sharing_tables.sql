CREATE TABLE public.sharing_tokens (
    token_id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.sharing_tokens OWNER TO "user";

CREATE SEQUENCE public.sharing_tokens_token_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.sharing_tokens_token_id_seq OWNER TO "user";
ALTER SEQUENCE public.sharing_tokens_token_id_seq OWNED BY public.sharing_tokens.token_id;

ALTER TABLE ONLY public.sharing_tokens ALTER COLUMN token_id SET DEFAULT nextval('public.sharing_tokens_token_id_seq'::regclass);

ALTER TABLE ONLY public.sharing_tokens
    ADD CONSTRAINT sharing_tokens_pkey PRIMARY KEY (token_id);

ALTER TABLE ONLY public.sharing_tokens
    ADD CONSTRAINT sharing_tokens_token_key UNIQUE (token);

ALTER TABLE ONLY public.sharing_tokens
    ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES public.users(user_id);

CREATE TABLE public.user_connections (
    connection_id integer NOT NULL,
    user_id integer NOT NULL,
    connected_user_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.user_connections OWNER TO "user";

CREATE SEQUENCE public.user_connections_connection_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.user_connections_connection_id_seq OWNER TO "user";
ALTER SEQUENCE public.user_connections_connection_id_seq OWNED BY public.user_connections.connection_id;

ALTER TABLE ONLY public.user_connections ALTER COLUMN connection_id SET DEFAULT nextval('public.user_connections_connection_id_seq'::regclass);

ALTER TABLE ONLY public.user_connections
    ADD CONSTRAINT user_connections_pkey PRIMARY KEY (connection_id);

ALTER TABLE ONLY public.user_connections
    ADD CONSTRAINT user_connections_user_id_connected_user_id_key UNIQUE (user_id, connected_user_id);

ALTER TABLE ONLY public.user_connections
    ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES public.users(user_id);

ALTER TABLE ONLY public.user_connections
    ADD CONSTRAINT fk_connected_user FOREIGN KEY (connected_user_id) REFERENCES public.users(user_id);
